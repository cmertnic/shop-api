import { Injectable } from '@nestjs/common';
import { getAllProducts as getAllProductsFromDb, getProductByNameAndUrl, addProduct, updateProduct } from '../../database/productDb';
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
  price: number;
  url: string;
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
      nextPageSelector: string;
    };
    alternatives: Array<{
      categorySelector: string;
      subcategorySelector: string;
      productSelector: string;
      nameSelector: string;
      priceSelector: string;
      linkSelector: string;
      nextPageSelector: string;
    }>;
  };
}

@Injectable()
export class ProductsService {
  private maxConcurrentTabs = 100;
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

  private normalizePrice(price: any): number {
    if (typeof price === 'string') {
      const match = price.match(/(\d[\d\s]*₽)/);
      if (match) {
        return parseFloat(match[0].replace(/\s+/g, '').replace(/[₽]/g, ''));
      }
    } else if (typeof price === 'number') {
      return price;
    } else {
      console.warn(`Неизвестный тип цены: ${price}. Устанавливаем значение по умолчанию 0.`);
      return 0;
    }
  }

  public async processStores() {
    const stores = await getAllStores();

    for (const store of stores) {
      console.log(`Обработка магазина: ${store.name}`);
      const addedProductIds = await this.scrapeAllProducts(store.id);
    }
  }

  private async withSemaphore<T>(fn: () => Promise<T>, maxTabs: number, activeTabsCount: () => number): Promise<T> {
    while (activeTabsCount() >= maxTabs) {
      await this.delay(100);
    }

    this.activeTabs++;

    try {
      return await fn();
    } finally {
      this.activeTabs--;
    }
  }

  public async scrapeAllProducts(storeId: number): Promise<number[]> {
    console.log(`Начинаем процесс сканирования продуктов для магазина с ID ${storeId}`);

    const store = await getStoreById(storeId);
    if (!store) {
        console.error(`Не удалось получить магазин с ID ${storeId}`);
        return [];
    }

    const baseUrl = store.baseUrl;
    const selectors = JSON.parse(store.selectors);
    const categorySelector = selectors.default.categorySelector;
    console.log(`Получен магазин: ${store.name}. Base URL: ${baseUrl}, Category Selector: ${categorySelector}`);

    const initialProducts = await this.scrapeProducts(baseUrl, storeId, baseUrl, selectors);
    console.log(`Найдено ${initialProducts.length} продуктов на главной странице.`);

    const categoryLinks: string[] = await this.getCategoryLinks(baseUrl, categorySelector);
    console.log(`Найдено ${categoryLinks.length} категорий для сканирования.`);

    const existingProductNames: Set<string> = new Set<string>();
    const addedProductIds: number[] = [];

    const categoryScrapePromises = categoryLinks.map(async (categoryLink) => {
        // Сканируем продукты в текущей категории
        const categoryProductIds = await this.scrapeProductsFromCategory(categoryLink, baseUrl, existingProductNames, storeId, selectors);
        addedProductIds.push(...categoryProductIds);

        // Извлечение подкатегорий и сканирование их
        const subCategoryLinks = await this.getCategoryLinks(categoryLink, selectors.default.subcategorySelector);
        for (const subCategoryLink of subCategoryLinks) {
            const subCategoryProductIds = await this.scrapeProductsFromCategory(subCategoryLink, baseUrl, existingProductNames, storeId, selectors);
            addedProductIds.push(...subCategoryProductIds);
        }
    });

    await Promise.all(categoryScrapePromises);
    console.log(`Сканирование завершено. Всего добавлено продуктов: ${addedProductIds.length}`);
    return addedProductIds;
}

private async scrapeProductsFromCategory(
  categoryUrl: string,
  baseUrl: string,
  existingProductNames: Set<string>,
  storeId: number,
  selectors: any
): Promise<number[]> {
  const addedProductIds: number[] = [];
  const products: Product[] = [];
  const page = await this.browser.newPage();

  try {
      await page.goto(categoryUrl, { waitUntil: 'networkidle2', timeout: 180000 });

      // Прокрутка страницы вниз для загрузки всех товаров
      await this.scrollToBottom(page);

      const store = await getStoreById(storeId);
      if (!store) {
          console.error(`Магазин с ID ${storeId} не найден.`);
          return addedProductIds;
      }

      const nextPageSelector = selectors.default.nextPageSelector;
      let hasNextPage = true;
      const pageUrls: string[] = [categoryUrl];

      while (hasNextPage) {
          const nextPageButton = await page.$(nextPageSelector);
          if (nextPageButton) {
              console.log(`Следующая страница найдена. Переход на следующую страницу...`);
              await nextPageButton.click();
              await this.delay(7000); 
              await this.scrollToBottom(page); 
              const nextUrl = page.url();
              pageUrls.push(nextUrl);
          } else {
              console.log(`Следующая страница не найдена. Завершение сканирования...`);
              hasNextPage = false;
          }
      }

      const scrapePromises = pageUrls.map(url => this.withSemaphore(() => this.scrapeProducts(url, storeId, baseUrl, selectors), this.maxConcurrentTabs, () => this.activeTabs));

      const allProducts = await Promise.all(scrapePromises);
      allProducts.forEach(newProducts => products.push(...newProducts));

  } catch (error) {
      console.error(`Ошибка при сканировании категории ${categoryUrl}: ${error.message}`);
  } finally {
      await page.close(); // Закрываем страницу в любом случае
  }

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
                      console.log(`Обновлен продукт: ${product.name} с ID: ${existingProduct.id} | Старая цена: ${existingPrice} | Новая цена: ${newPrice}`);
                  } else {
                      console.log(`Продукт ${product.name} уже существует с такой же ценой, пропускаем.`);
                  }
                  return existingProduct.id;
              } else {
                  existingProductNames.add(product.name);
                  const productId = await addProduct(product);
                  return productId;
              }
          } catch (err) {
              console.error(`Ошибка при добавлении или обновлении продукта ${product.name}: ${err.message}`);
              return null;
          }
      });

      // Ожидаем завершения всех операций добавления/обновления
      const results = await Promise.allSettled(addProductPromises);
      results.forEach(result => {
          if (result.status === 'fulfilled') {
              addedProductIds.push(result.value as number);
          }
      });
  } else {
      console.log(`В категории ${categoryUrl} не найдено продуктов.`);
  }

  return addedProductIds;
}

  private async scrapeProducts(categoryUrl: string, storeId: number, baseUrl: string, selectors: any): Promise<Product[]> {
    const products: Product[] = [];
    const page = await this.browser.newPage();
    const store = await getStoreById(storeId);
    if (!store) {
      console.error(`Магазин с ID ${storeId} не найден.`);
      return products;
    }

    try {
      await page.goto(categoryUrl, { waitUntil: 'networkidle2', timeout: 180000 });

      // Извлечение продуктов с текущей страницы
      const productElements = await page.$$(selectors.default.productSelector);
      if (productElements.length === 0) {
        // Если товары не найдены, пробуем альтернативные селекторы
        for (const alternative of selectors.alternatives) {
          const altProductElements = await page.$$(alternative.productSelector);
          if (altProductElements.length > 0) {
            console.log(`Используем альтернативный селектор: ${alternative.productSelector}`);
            productElements.push(...altProductElements);
            break; 
          }
        }
      }

      for (const element of productElements) {
        const nameElement = await element.$(selectors.default.nameSelector);
        const priceElement = await element.$(selectors.default.priceSelector);
        const linkElement = await element.$(selectors.default.linkSelector);

        const name = nameElement ? await page.evaluate(el => (el as HTMLElement).innerText, nameElement) : '';
        const price = priceElement ? await page.evaluate(el => (el as HTMLElement).innerText, priceElement) : '';
        const link = linkElement ? await page.evaluate(el => (el as HTMLAnchorElement).href, linkElement) : '';

        // Игнорируем нежелательные ссылки
        if (link &&
          !link.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|jpg|jpeg|png|gif)$/i) && 
          !link.includes('some-other-unwanted-link') &&
          !link.includes('word') &&
          !link.includes('excel') &&
          !link.includes('image')) { 

          if (name) {
            const normalizedPrice = this.normalizePrice(price);
            products.push({ name, price: normalizedPrice, url: link });
          }
        }


      }
    } catch (error) {
      console.error(`Ошибка при извлечении продуктов из категории ${categoryUrl}: ${error.message}`);
    } finally {
      await page.close(); // Закрываем страницу в любом случае
    }

    return products;
  }


  private async getCategoryLinks(baseUrl: string, selector: string): Promise<string[]> {
    const links: string[] = [];
    const page = await this.browser.newPage();
    try {
      await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 180000 });

      const categoryElements = await page.$$(selector);
      for (const element of categoryElements) {
        const linkHandle = await element.getProperty('href');
        const link = await linkHandle.jsonValue() as string;
        if (link) {
          links.push(link);
        }
      }
    } catch (error) {
      console.error(`Ошибка при получении ссылок категорий: ${error.message}`);
    } finally {
      await page.close();
    }
    return links;
  }



  private async scrollToBottom(page: puppeteer.Page): Promise<void> {
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          window.scrollBy(0, window.innerHeight);
          if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight) {
            clearInterval(interval);
            resolve();
          }
        }, 100);
      });
    });
  }

  public async getHello(): Promise<any[]> {  
    try {
      return await getAllProductsFromDb(); // Получаем все продукты
    } catch (err) {
      throw new Error(`Ошибка при получении приветствия: ${err.message}`);
    }
  }
}


