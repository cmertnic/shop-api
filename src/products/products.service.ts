import { Injectable } from '@nestjs/common';
import { getAllProducts as getAllProductsFromDb, getProductByNameAndUrl, getProductById, addProduct, updateProduct } from '../../database/productDb';
import * as puppeteer from 'puppeteer';
import { Database } from 'sqlite3';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { getAllStores, getStoreById } from '../../database/storesDb';
dotenv.config();

if (!process.env.SQLITE_STORE_DB_PATH) {
  console.error('Переменная окружения SQLITE_STORE_DB_PATH не определена.');
  process.exit(1);
}

const dbPath = path.resolve(process.env.SQLITE_STORE_DB_PATH);

const db = new Database(dbPath, (err) => {
  if (err) {
    console.error(`Ошибка при подключении к базе данных: ${err.message}`);
    process.exit(1);
  }
  console.log('Подключено к базе данных товаров');
});

interface Product {
  id?: number;
  name: string;
  price: string;
  url: string;
  img?: string;
}

interface StoreType {
  id: number;
  baseUrl: string;
  selectors: {
    default: {
      categorySelector: string;
      subcategorySelector: string;
      productSelector: string;
      nameSelector: string;
      priceSelector: string;
      linkSelector: string;
      imageSelector: string;
      nextPageSelector: string;
    };
    alternatives: Array<{
      categorySelector: string;
      subcategorySelector: string;
      productSelector: string;
      nameSelector: string;
      priceSelector: string;
      linkSelector: string;
      imageSelector: string;
      nextPageSelector: string;
    }>;
  };
}

@Injectable()
export class ProductsService {
  private maxConcurrentTabs = 200;
  private activeTabs = 0;
  private browser: puppeteer.Browser;
  private visitedUrls: Set<string> = new Set();

  constructor() { }

  public async initBrowser() {
    this.browser = await puppeteer.launch({ headless: true });
  }

  public async closeBrowser() {
    await this.browser.close();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private normalizePrice(price: any): string {
    if (typeof price === 'string') {
      const match = price.match(/(\d[\d\s]*[₽€$])/);
      if (match) {
        return match[0].replace(/\s+/g, '');
      }
    } else if (typeof price === 'number') {
      return price.toString();
    } else {
      console.warn(`Неизвестный тип цены: ${price}. Устанавливаем значение по умолчанию "0".`);
      return '0';
    }
  }

  private async scrapeProducts(categoryUrl: string, storeId: number, baseUrl: string, selectors: any): Promise<Product[]> {
    const products: Product[] = [];
    const page = await this.browser.newPage();
    const store = await getStoreById(storeId);

    if (!store) {
      console.error(`Магазин с ID ${storeId} не найден.`);
      return products;
    }

    if (this.visitedUrls.has(categoryUrl)) {
      await page.close();
      return products;
    }

    this.visitedUrls.add(categoryUrl);

    try {
      await page.goto(categoryUrl, { waitUntil: 'networkidle2', timeout: 100000 });
      let productElements = await page.$$(selectors.default.productSelector);

      // Если продукты не найдены, проверяем альтернативные селекторы
      if (productElements.length === 0 && selectors.alternatives) {
        for (const altSelector of selectors.alternatives) {
          const altProductElements = await page.$$(altSelector.productSelector);
          if (altProductElements.length > 0) {
            productElements = altProductElements;
            console.log(`Используем альтернативный селектор: ${altSelector.productSelector}`);
            break;
          }
        }
      }

      // Проверка на наличие продуктов
      if (productElements.length === 0) {
        console.warn(`Продукты не найдены в категории: ${categoryUrl}`);
        return products;
      }

      // Извлекаем продукты
      const productPromises = productElements.map(async (element) => {
        let name = '', price = '', img = '', link = '';

        // Перебираем селекторы для имени
        for (const selector of [selectors.default.nameSelector, ...selectors.alternatives.map(a => a.nameSelector)]) {
          const nameElement = await element.$(selector);
          if (nameElement) {
            name = await page.evaluate((el: HTMLElement) => el.innerText.trim(), nameElement as unknown as HTMLElement);
            break;
          }
        }

        // Перебираем селекторы для цены
        for (const selector of [selectors.default.priceSelector, ...selectors.alternatives.map(a => a.priceSelector)]) {
          const priceElement = await element.$(selector);
          if (priceElement) {
            price = await page.evaluate((el: HTMLElement) => el.innerText.trim(), priceElement as unknown as HTMLElement);
            break;
          }
        }

        // Перебираем селекторы для изображения
        for (const selector of [selectors.default.imageSelector, ...selectors.alternatives.map(a => a.imageSelector)]) {
          const imgElement = await element.$(selector);
          if (imgElement) {
            img = await page.evaluate((el: HTMLImageElement) => el.srcset || el.src || el.getAttribute('src'), imgElement as unknown as HTMLImageElement);
            break;
          }
        }

        // Перебираем селекторы для ссылки
        for (const selector of [selectors.default.linkSelector, ...selectors.alternatives.map(a => a.linkSelector)]) {
          const linkElement = await element.$(selector);
          if (linkElement) {
            link = await page.evaluate((el: HTMLAnchorElement) => el.href, linkElement as unknown as HTMLAnchorElement);
            break;
          }
        }

        // Добавляем продукт в массив
        const normalizedPrice = this.normalizePrice(price);
        products.push({ name: name || '', price: normalizedPrice, url: link, img: img || '' });

        return { name: name || '', price: normalizedPrice, url: link, img: img || '' };
      });

      await Promise.all(productPromises);

      // Получаем ссылки на подкатегории
      const subCategoryLinks = await this.getCategoryLinks(categoryUrl, selectors.default.subcategorySelector, selectors);
      const subCategoryPromises = subCategoryLinks.map(subCategoryLink => this.scrapeProducts(subCategoryLink, storeId, baseUrl, selectors));
      const subCategoryProducts = await Promise.all(subCategoryPromises);
      products.push(...subCategoryProducts.flat());
      await this.saveProductsToDb(products);

    } catch (error) {
      console.error(`Ошибка при извлечении продуктов из категории ${categoryUrl}: ${error.message}`);
    } finally {
      await page.close();
    }

    return products;
  }
  private async getCategoryLinks(categoryUrl: string, subcategorySelector: string, selectors: any): Promise<string[]> {
    const links: string[] = [];
    const page = await this.browser.newPage();

    try {
      await page.goto(categoryUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      const subCategoryElements = await page.$$(subcategorySelector);

      for (const element of subCategoryElements) {
        const link = await page.evaluate((el: HTMLAnchorElement) => el.href, element as unknown as HTMLAnchorElement);
        links.push(link);
      }
    } catch (error) {
      console.error(`Ошибка при получении подкатегорий из ${categoryUrl}: ${error.message}`);
    } finally {
      await page.close();
    }

    return links;
  }

  public async getAllProducts(storeId: number) {
    const store = await getStoreById(storeId);
    if (!store) {
      console.error(`Магазин с ID ${storeId} не найден.`);
      return [];
    }

    const selectors = store.selectors;
    const allProducts: Product[] = [];

    try {
      const categoryLinks = await getAllStores(); // Получаем все категории магазина
      const categoryPromises = categoryLinks.map(categoryLink => this.scrapeProducts(categoryLink, storeId, store.baseUrl, selectors));
      const productsFromCategories = await Promise.all(categoryPromises);
      allProducts.push(...productsFromCategories.flat()); // Объединяем все продукты
    } catch (error) {
      console.error(`Ошибка при извлечении всех продуктов: ${error.message}`);
    }

    return allProducts;
  }

  public async saveProductsToDb(products: Product[]) {
    for (const product of products) {
      const existingProduct = await getProductByNameAndUrl(product.name, product.url);
      if (existingProduct) {
        await updateProduct(existingProduct.id, product);
      } else {
        await addProduct(product);
      }
    }
  }
  public async getHello(): Promise<any[]> {
    try {
      return await getAllProductsFromDb();
    } catch (err) {
      throw new Error(`Ошибка при получении приветствия: ${err.message}`);
    }
  }
  private clearVisitedUrls(): void {
    this.visitedUrls.clear(); // Очищаем посещённые ссылки
  }
  public async scrapeAllProducts(storeId: number): Promise<number[]> {
    this.clearVisitedUrls();
    console.log(`Начинаем процесс сканирования продуктов для магазина с ID ${storeId}`);

    const store = await getStoreById(storeId);
    if (!store) {
      console.error(`Не удалось получить магазин с ID ${storeId}`);
      return [];
    }

    const baseUrl = store.baseUrl;
    const selectors = JSON.parse(store.selectors) as StoreType['selectors'];
    const categorySelector = selectors.default.categorySelector;
    const productSelector = selectors.default.productSelector; // Основной селектор для продуктов
    console.log(`Получен магазин: ${store.name}. Base URL: ${baseUrl}, Category Selector: ${categorySelector}, Product Selector: ${productSelector}`);

    // Получение продуктов с использованием основного селектора
    const initialProducts = await this.scrapeProducts(baseUrl, storeId, baseUrl, selectors);
    if (initialProducts.length === 0) {
      console.log(`Основной селектор для продуктов не сработал. Пробуем альтернативные селекторы...`);
      for (const altSelector of selectors.alternatives) {
        const altProducts = await this.scrapeProducts(baseUrl, storeId, baseUrl, { ...selectors, default: { ...selectors.default, productSelector: altSelector.productSelector } });
        if (altProducts.length > 0) {
          console.log(`Альтернативный селектор ${altSelector.productSelector} сработал.`);
          initialProducts.push(...altProducts);
          break; // Выходим из цикла, если один из альтернативных селекторов сработал
        }
      }
    }

    console.log(`Найдено ${initialProducts.length} продуктов на главной странице.`);

    const categoryLinks: string[] = await this.getCategoryLinks(baseUrl, categorySelector, selectors);
    console.log(`Найдено ${categoryLinks.length} категорий для сканирования.`);

    const existingProductNames: Set<string> = new Set<string>();
    const addedProductIds: number[] = [];

    const categoryScrapePromises = categoryLinks.map(async (categoryLink) => {
      // Сканируем продукты в текущей категории
      const categoryProductIds = await this.scrapeProductsFromCategory(categoryLink, baseUrl, existingProductNames, storeId, selectors);
      addedProductIds.push(...categoryProductIds);

      // Извлечение подкатегорий и сканирование их
      const subCategoryLinks = await this.getCategoryLinks(categoryLink, selectors.default.subcategorySelector, selectors);
      for (const subCategoryLink of subCategoryLinks) {
        const subCategoryProductIds = await this.scrapeProductsFromCategory(subCategoryLink, baseUrl, existingProductNames, storeId, selectors);
        addedProductIds.push(...subCategoryProductIds);
      }
    });

    await Promise.all(categoryScrapePromises);

    // Асинхронное исправление неправильных товаров
    await this.fixIncorrectProducts(addedProductIds, selectors);

    await this.delay(100000);

    console.log(`Сканирование завершено. Всего добавлено продуктов: ${addedProductIds.length}`);
    return addedProductIds;
  }
  private async fixIncorrectProduct(productId: number, selectors: StoreType['selectors']): Promise<void> {
    const product = await getProductById(productId).catch(err => {
        console.error(`Ошибка при получении продукта с ID ${productId}: ${err.message}`);
        return null;
    });

    if (!product) return; // Если продукт не найден, выходим

    const isInvalidProduct = !product.img || product.img === '' || !product.name || !product.price || !product.url;

    if (isInvalidProduct) {
        console.log(`Исправление товара с ID ${productId}.`);

        const productPage = await this.browser.newPage();
        await productPage.goto(product.url, { waitUntil: 'networkidle2' });

        let foundImage = false;
        for (const altSelector of selectors.alternatives) {
            if (!product.img) {
                const imgElement = await productPage.$(altSelector.imageSelector);
                if (imgElement) {
                    product.img = await productPage.evaluate((el: HTMLImageElement) => el.srcset || el.src || el.getAttribute('src'), imgElement);
                    console.log(`Изображение найдено для товара с ID ${productId}: ${product.img}`);
                    foundImage = true;
                    break;
                }
            }
        }

        if (!foundImage) {
            console.warn(`Не удалось найти изображение на странице товара: ${product.url}`);
        }

        await updateProduct(productId, { img: product.img });

        await productPage.close();
        await this.delay(1000);
    }
}
private async fixIncorrectProducts(productIds: number[], selectors: StoreType['selectors']): Promise<void> {
    console.log(`Начинаем исправление неправильных товаров...`);

    await Promise.all(productIds.map(productId => this.fixIncorrectProduct(productId, selectors)));

    console.log(`Исправление неправильных товаров завершено.`);
}


  private async scrapeProductsFromCategory(
    categoryUrl: string,
    baseUrl: string,
    existingProductNames: Set<string>,
    storeId: number,
    selectors: StoreType['selectors']
  ): Promise<number[]> {
    const addedProductIds: number[] = [];
    const products: Product[] = [];
    const page = await this.browser.newPage();

    try {
      await page.goto(categoryUrl, { waitUntil: 'networkidle2', timeout: 200000 });

      // Прокрутка страницы вниз для загрузки всех товаров
      await this.scrollToBottom(page);

      const store = await getStoreById(storeId);
      if (!store) {
        console.error(`Магазин с ID ${storeId} не найден.`);
        return addedProductIds;
      }

      // Извлекаем продукты с помощью метода scrapeProducts
      const extractedProducts = await this.scrapeProducts(categoryUrl, storeId, baseUrl, selectors);
      products.push(...extractedProducts);
      await this.delay(10000);
      // Обработка найденных продуктов
      if (products.length > 0) {
        const addProductPromises: Promise<number | null>[] = products.map(async (product: Product) => {
          try {
            const existingProduct = await getProductByNameAndUrl(product.name, product.url);
            if (existingProduct) {
              const existingPrice = this.normalizePrice(existingProduct.price);
              const newPrice = this.normalizePrice(product.price);

              if (existingPrice !== newPrice) {
                product.id = existingProduct.id;
                await updateProduct(product);
                return existingProduct.id;
              } else {
                return existingProduct.id;
              }
            } else {
              const newProductId = await addProduct(product);
              addedProductIds.push(newProductId);
              return newProductId;
            }
          } catch (error) {
            console.error(`Ошибка при добавлении или обновлении продукта ${product.name}: ${error.message}`);
            return null;
          }
        });

        const results = await Promise.all(addProductPromises);
        for (const result of results) {
          if (result !== null) {
            addedProductIds.push(result);
          }
        }
      } else {
        console.warn(`Не найдено ни одного продукта для добавления в категорию: ${categoryUrl}`);
      }
    } catch (error) {
      console.error(`Ошибка при парсинге категории ${categoryUrl}: ${error.message}`);
    } finally {
      await page.close();
    }

    return addedProductIds;
  }

  private async scrollToBottom(page: puppeteer.Page) {
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          if (document.body.scrollHeight === scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
  }
}

