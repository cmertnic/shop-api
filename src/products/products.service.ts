import { Injectable } from '@nestjs/common';
import { getAllProducts as getAllProductsFromDb, getProductByNameAndUrl, addProduct, updateProduct } from '../../database/productDb';
import * as puppeteer from 'puppeteer';
import { Database } from 'sqlite3';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { getAllStores, getStoreById } from '../../database/storesDb.js';

// Загружаем переменные окружения из файла .env
dotenv.config();

// Проверяем наличие переменной окружения SQLITE_STORE_DB_PATH
if (!process.env.SQLITE_STORE_DB_PATH) {
  console.error('Переменная окружения SQLITE_STORE_DB_PATH не определена.');
  process.exit(1);
}

// Получаем путь к базе данных из переменной окружения
const dbPath = path.resolve(process.env.SQLITE_STORE_DB_PATH);

// Создаем новое подключение к базе данных
const db = new Database(dbPath, (err) => {
  if (err) {
    console.error(`Ошибка при подключении к базе данных: ${err.message}`);
    process.exit(1);
  }
  console.log('Подключено к базе данных товаров');
});

// Интерфейс для результата запроса
interface Product {
  id?: number; // ID может быть необязательным при добавлении нового продукта
  name: string;
  price: number;
  url: string;
}

interface StoreType {
  id: number;
  baseUrl: string;
  categorySelector: string;
  productSelector: string; // Добавлено поле для селектора продуктов
  subcategorySelector: string; // Добавлено поле для селектора подкатегорий
  nextPageSelector: string;
}

@Injectable()
export class ProductsService {
  private maxConcurrentTabs = 100;
  private maxConcurrentSubcategoryTabs = 100;
  private activeTabs = 0;
  private activeSubcategoryTabs = 0;
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
        // Извлекаем только первую цену из строки с помощью регулярного выражения
        const match = price.match(/(\d[\d\s]*₽)/);
        if (match) {
            // Удаляем пробелы и символ рубля, затем преобразуем в число
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

    if (maxTabs === this.maxConcurrentTabs) {
      this.activeTabs++;
    } else {
      this.activeSubcategoryTabs++;
    }

    try {
      return await fn();
    } finally {
      if (maxTabs === this.maxConcurrentTabs) {
        this.activeTabs--;
      } else {
        this.activeSubcategoryTabs--;
      }
    }
  }

// Обновление задержки в scrapeAllProducts
public async scrapeAllProducts(storeId: number): Promise<number[]> {
  console.log(`Начинаем процесс сканирования продуктов для магазина с ID ${storeId}`);

  const store = await getStoreById(storeId);
  if (!store) {
      console.error(`Не удалось получить магазин с ID ${storeId}`);
      return [];
  }

  const baseUrl = store.baseUrl;
  const categorySelector = store.categorySelector;
  console.log(`Получен магазин: ${store.name}. Base URL: ${baseUrl}, Category Selector: ${categorySelector}`);

  // Сначала ищем продукты на первой странице
  const initialProducts = await this.scrapeProducts(baseUrl, storeId, baseUrl);
  console.log(`Найдено ${initialProducts.length} продуктов на главной странице.`);

  // Затем получаем ссылки на категории
  const categoryLinks: string[] = await this.getCategoryLinks(baseUrl, categorySelector);
  console.log(`Найдено ${categoryLinks.length} категорий для сканирования.`);

  const existingProductNames: Set<string> = new Set<string>();
  const addedProductIds: number[] = [];

  // Сканируем продукты из категорий асинхронно
  const categoryScrapePromises = categoryLinks.map(async (categoryLink) => {
      const categoryProductIds = await this.scrapeProductsFromCategory(categoryLink, baseUrl, existingProductNames, storeId);
      addedProductIds.push(...categoryProductIds);

          // Извлечение подкатегорий
          const subCategoryLinks = await this.getCategoryLinks(categoryLink, store.subcategorySelector);
          const subCategoryProductIds = await this.withSemaphore(async () => {
              return this.scrapeProductsFromCategories(subCategoryLinks, baseUrl, existingProductNames, storeId, store);
          }, this.maxConcurrentTabs, () => this.activeTabs);
          addedProductIds.push(...subCategoryProductIds);
      });
  
      await Promise.all(categoryScrapePromises); // Ждем завершения всех промисов
  
      // Возвращаем массив идентификаторов добавленных продуктов
      console.log(`Сканирование завершено. Всего добавлено продуктов: ${addedProductIds.length}`);
      return addedProductIds;
  }
  
    private async scrapeProductsFromCategory(categoryUrl: string, baseUrl: string, existingProductNames: Set<string>, storeId: number): Promise<number[]> {
      const addedProductIds: number[] = []; // Массив для хранения идентификаторов добавленных продуктов
      const products: Product[] = await this.withSemaphore(() => this.scrapeProducts(categoryUrl, storeId, baseUrl), this.maxConcurrentTabs, () => this.activeTabs);
      
      if (products.length > 0) {
          const addProductPromises: Promise<number | null>[] = products.map(async (product: Product) => {
              try {
                  const existingProduct = await getProductByNameAndUrl(product.name, product.url);
  
                  if (existingProduct) {
                      const existingPrice = this.normalizePrice(existingProduct.price);
                      const newPrice = this.normalizePrice(product.price);
  
                      if (existingPrice !== newPrice) {
                          product.id = existingProduct.id; // Сохраняем ID для обновления
                          await updateProduct(product);
                          console.log(`Обновлен продукт: ${product.name} с ID: ${existingProduct.id} | Старая цена: ${existingPrice} | Новая цена: ${newPrice}`);
                      } else {
                          console.log(`Продукт ${product.name} уже существует с такой же ценой, пропускаем.`);
                      }
                      return existingProduct.id; // Возвращаем ID существующего товара
                  } else {
                      existingProductNames.add(product.name);
                      const productId = await addProduct(product);
                      return productId; // Возвращаем ID нового товара
                  }
              } catch (err) {
                  console.error(`Ошибка при добавлении или обновлении продукта ${product.name}: ${err.message}`);
                  return null; // Возвращаем null в случае ошибки
              }
          });
  
          const results = await Promise.all(addProductPromises);
          addedProductIds.push(...results.filter((id): id is number => id !== null)); // Фильтруем null значения
      } else {
          console.log(`В категории ${categoryUrl} не найдено продуктов.`);
      }
  
      // Переход на следующую страницу
      const store = await getStoreById(storeId);
      if (!store) {
          console.error(`Магазин с ID ${storeId} не найден.`);
          return addedProductIds; // Возвращаем добавленные продукты, если магазин не найден
      }
  
      const nextPageSelector = store.nextPageSelector; // Получаем селектор следующей страницы
  
      let hasNextPage = true;
  
      // Создаем новую страницу
      const page = await this.browser.newPage();
      await page.goto(categoryUrl, { waitUntil: 'networkidle2', timeout: 50000 }); // Переход на страницу категории
  
      while (hasNextPage) {
          const nextPageButton = await page.$(nextPageSelector); // Используем селектор для следующей страницы
          if (nextPageButton) {
              await nextPageButton.click(); // Кликаем по элементу для перехода на следующую страницу
              await this.delay(5000); // Увеличенная задержка для загрузки новой страницы (5 секунд)
  
              // Сканируем продукты на новой странице
              const newProducts = await this.scrapeProducts(categoryUrl, storeId, baseUrl);
              products.push(...newProducts); // Добавляем новые продукты к общему массиву
          } else {
              hasNextPage = false; // Если кнопки нет, выходим из цикла
          }
      }
  
      await page.close(); // Закрываем страницу после обработки
      return addedProductIds; // Возвращаем массив идентификаторов добавленных продуктов
  }
    public async getHello(): Promise<any[]> {  
      try {
        return await getAllProductsFromDb(); // Получаем все продукты
      } catch (err) {
        throw new Error(`Ошибка при получении приветствия: ${err.message}`);
      }
    }
// Обновление задержки в scrapeProducts
private async scrapeProducts(categoryUrl: string, storeId: number, baseUrl: string): Promise<Product[]> {
  const page = await this.browser.newPage();
  const products: Product[] = [];

  try {
      const store = await getStoreById(storeId);
      if (!store) {
          console.error(`Магазин с ID ${storeId} не найден.`);
          return [];
      }

      const productSelector = store.productSelector;
      const nameSelector = store.nameSelector;
      const priceSelector = store.priceSelector;
      const linkSelector = store.linkSelector;

      console.log(`Переход на страницу категории: ${categoryUrl}`);
      await page.goto(categoryUrl, { waitUntil: 'networkidle2', timeout: 50000 });

      // Определяем productElements здесь
      const productElements = await page.$$(productSelector); // Изменено на $$, чтобы получить массив элементов

      for (const element of productElements) {
          const name = await element.$eval(nameSelector, el => el.textContent?.trim() || '');
          const price = await element.$eval(priceSelector, el => el.textContent?.trim() || '0');
          const url = await element.$eval(linkSelector, el => el.getAttribute('href') || '');

          if (name && url) {
              products.push({
                  name,
                  price: this.normalizePrice(price),
                  url: new URL(url, baseUrl).href, // Формируем полный URL
              });
          }
      }

      await this.delay(5000); // Увеличенная задержка после обработки продуктов
  } catch (error) {
      console.error(`Ошибка при сканировании продуктов на странице ${categoryUrl}: ${error.message}`);
  } finally {
      await page.close();
  }

  return products;
}


  
  private async getCategoryLinks(baseUrl: string, categorySelector: string): Promise<string[]> {
    const page = await this.browser.newPage();
    const categoryLinks: string[] = [];

    try {
        await page.goto(baseUrl, { waitUntil: 'networkidle2' });
        const categories = await page.$$(categorySelector); // Изменено на $$, чтобы получить массив элементов

        for (const category of categories) {
            const link = await category.evaluate(el => el.getAttribute('href'));
            if (link) {
                categoryLinks.push(new URL(link, baseUrl).href); // Формируем полный URL
            }
        }
        await this.delay(5000); // Увеличенная задержка после получения всех категорий
    } catch (error) {
        console.error(`Ошибка при получении ссылок на категории: ${error.message}`);
    } finally {
        await page.close();
    }

    return categoryLinks;
}

  
    private async scrapeProductsFromCategories(subCategoryLinks: string[], baseUrl: string, existingProductNames: Set<string>, storeId: number, store: StoreType): Promise<number[]> {
      const addedProductIds: number[] = [];
  
      const subCategoryScrapePromises = subCategoryLinks.map(async (subCategoryLink) => {
        const subCategoryProductIds = await this.scrapeProductsFromCategory(subCategoryLink, baseUrl, existingProductNames, storeId);
        addedProductIds.push(...subCategoryProductIds);
      });
  
      await Promise.all(subCategoryScrapePromises);
      return addedProductIds;
    }
  }
  
  