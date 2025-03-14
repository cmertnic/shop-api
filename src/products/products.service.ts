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
    default: storedeafute,
    alternatives: storedeafute[]
  };
}
interface storedeafute {
  categorySelector: string;
  subcategorySelector: string;
  productSelector: string;
  nameSelector: string;
  priceSelector: string;
  linkSelector: string;
  imageSelector: string;
  nextPageSelector: string;
}

@Injectable()
export class ProductsService {
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
      await this.setRandomUserAgent(page);
      await page.goto(categoryUrl, { waitUntil: 'domcontentloaded', timeout: 100000 });

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

        const normalizedPrice = this.normalizePrice(price);
        products.push({ name: name || '', price: normalizedPrice, url: link, img: img || '' });

        return { name: name || '', price: normalizedPrice, url: link, img: img || '' };
      });

      await Promise.all(productPromises);

      const subCategoryLinks = await this.getCategoryLinks(categoryUrl, selectors.default.subcategorySelector, selectors);
      const subCategoryPromises = subCategoryLinks.map(subCategoryLink => this.scrapeProducts(subCategoryLink, storeId, baseUrl, selectors));
      const subCategoryProducts = await Promise.all(subCategoryPromises);
      products.push(...subCategoryProducts.flat());

      await this.saveProductsToDb(products);

      await this.delay(2000);

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
        console.log(`Переход на страницу категории: ${categoryUrl}`);
        await this.setRandomUserAgent(page);
        await page.goto(categoryUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        const subCategoryElements = await page.$$(subcategorySelector);
        console.log(`Найдено подкатегорий: ${subCategoryElements.length}`);

        for (const element of subCategoryElements) {
            let link = await page.evaluate((el) => {
                const anchor = el.querySelector('a');
                return anchor ? anchor.href : null;
            }, element);

            // Если ссылка не найдена, пробуем найти её в родительском элементе
            if (!link) {
                link = await page.evaluate((el) => {
                    const parentAnchor = el.closest('div')?.querySelector('a');
                    return parentAnchor ? parentAnchor.href : null;
                }, element);
            }

            // Если ссылка все еще не найдена, проверяем наличие onclick
            if (!link) {
                const hasOnClick = await page.evaluate((el) => {
                    return el.hasAttribute('onclick');
                }, element);

                if (hasOnClick) {
                    console.log(`Клик по элементу с onclick`);
                    await page.evaluate((el) => {
                        (el as HTMLElement).click();
                    }, element);
                    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
                    link = page.url();
                    console.log(`Переход по ссылке: ${link}`);
                } else {
                    console.log(`Элемент не содержит ссылки и onclick.`);
                }
            }

            // Если ссылка все еще не найдена, проверяем onclick для получения URL
            if (!link) {
                link = await page.evaluate((el) => {
                    const onclick = el.getAttribute('onclick');
                    if (onclick) {
                        const match = onclick.match(/location.href='([^']+)'/);
                        return match ? match[1] : null;
                    }
                    return null;
                }, element);
            }

            // Если ссылка найдена, добавляем её в массив
            if (link) {
                console.log(`Найдена ссылка: ${link}`);
                links.push(link);
            }
        }

        await this.delay(2000);
        console.log(`Общее количество найденных ссылок: ${links.length}`);

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
      const categoryLinks = await getAllStores();
      const categoryPromises = categoryLinks.map(categoryLink => this.scrapeProducts(categoryLink, storeId, store.baseUrl, selectors));
      const productsFromCategories = await Promise.all(categoryPromises);
      allProducts.push(...productsFromCategories.flat());
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
    const productSelector = selectors.default.productSelector;
    console.log(`Получен магазин: ${store.name}. Base URL: ${baseUrl}, Category Selector: ${categorySelector}, Product Selector: ${productSelector}`);

    const initialProducts = await this.scrapeProducts(baseUrl, storeId, baseUrl, selectors);
    if (initialProducts.length === 0) {
      console.log(`Основной селектор для продуктов не сработал. Пробуем альтернативные селекторы...`);
      for (const altSelector of selectors.alternatives) {
        const altProducts = await this.scrapeProducts(baseUrl, storeId, baseUrl, { ...selectors, default: { ...selectors.default, productSelector: altSelector.productSelector } });
        if (altProducts.length > 0) {
          console.log(`Альтернативный селектор ${altSelector.productSelector} сработал.`);
          initialProducts.push(...altProducts);
          break;
        }
      }
    }

    console.log(`Найдено ${initialProducts.length} продуктов на главной странице.`);

    const categoryLinks: string[] = await this.getCategoryLinks(baseUrl, categorySelector, selectors);
    console.log(`Найдено ${categoryLinks.length} категорий для сканирования.`);

    const existingProductNames: Set<string> = new Set<string>();
    const addedProductIds: number[] = [];

    const categoryScrapePromises = categoryLinks.map(async (categoryLink) => {
      const categoryProductIds = await this.scrapeProductsFromCategory(categoryLink, baseUrl, existingProductNames, storeId, selectors);
      addedProductIds.push(...categoryProductIds);

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

  private async fixIncorrectProducts(productIds: number[], selectors: StoreType['selectors']): Promise<void> {
    const fixPromises = productIds.map(productId => this.fixIncorrectProduct(productId, selectors));
    await Promise.all(fixPromises);
  }

  private async scrapeProductsFromCategory(categoryUrl: string, baseUrl: string, existingProductNames: Set<string>, storeId: number, selectors: StoreType['selectors']): Promise<number[]> {
    const addedProductIds: number[] = [];
    const products: Product[] = [];
    const page = await this.browser.newPage();

    try {
      await this.setRandomUserAgent(page);
      await page.goto(categoryUrl, { waitUntil: 'networkidle2', timeout: 200000 });

      // Прокрутка страницы вниз для загрузки всех товаров
      await this.scrollToBottom(page);

      const store = await getStoreById(storeId);
      if (!store) {
        console.error(`Магазин с ID ${storeId} не найден.`);
        return addedProductIds;
      }

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

      await this.fixIncorrectProducts(addedProductIds, selectors);

      await this.delay(2000);

    } catch (error) {
      console.error(`Ошибка при парсинге категории ${categoryUrl}: ${error.message}`);
    } finally {
      await page.close();
    }

    return addedProductIds;
  }

  private async fixIncorrectProduct(productId: number, selectors: StoreType['selectors']): Promise<void> {
    const product = await getProductById(productId).catch(err => {
      console.error(`Ошибка при получении продукта с ID ${productId}: ${err.message}`);
      return null;
    });

    if (!product) {
      console.warn(`Продукт с ID ${productId} не найден, выходим из функции.`);
      return;
    }

    const page = await this.browser.newPage();
    try {
      await this.setRandomUserAgent(page);
      await page.goto(product.url, { waitUntil: 'networkidle2', timeout: 60000 });

      // Извлекаем обновленные данные о продукте
      const updatedProductData = await this.scrapeProductData(page, selectors);
      if (updatedProductData) {
        await updateProduct({ ...product, ...updatedProductData });
        console.log(`Продукт с ID ${productId} успешно обновлён.`);
      }
    } catch (error) {
      console.error(`Ошибка при исправлении продукта с ID ${productId}: ${error.message}`);
    } finally {
      await page.close();
    }
  }
  private async scrapeProductData(page: puppeteer.Page, selectors: StoreType['selectors']): Promise<Partial<Product> | null> {
    try {
      const name = await page.$eval(selectors.default.nameSelector, el => el.textContent?.trim() || '');
      const price = await page.$eval(selectors.default.priceSelector, el => el.textContent?.trim() || '');
      const imageUrl = await page.$eval(selectors.default.imageSelector, (el: Element) => (el as HTMLImageElement).src || '');

      return {
        name,
        price,
        img: imageUrl
      };
    } catch (error) {
      console.error(`Ошибка при извлечении данных о продукте: ${error.message}`);
      return null;
    }
  }


  private async setRandomUserAgent(page: puppeteer.Page): Promise<void> {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Safari/605.1.15',
      'Mozilla/5.0 (Linux; Android 10; Pixel 3 XL) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Mobile Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
    ];

    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    await page.setUserAgent(randomUserAgent);
  }

  private async scrollToBottom(page: puppeteer.Page) {
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        const distance = 100;
        let lastScrollHeight = 0;
        const maxAttempts = 10;
        let attempts = 0;

        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);

          // Проверка, изменяется ли высота страницы
          if (scrollHeight === lastScrollHeight) {
            attempts++;
            if (attempts >= maxAttempts) {
              clearInterval(timer);
              resolve();
            }
          } else {
            attempts = 0;
          }

          lastScrollHeight = scrollHeight;
        }, 100);
      });
    });
  }

}

