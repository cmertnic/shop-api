import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ProductsService } from './products/products.service'; 
import { initStore, getAllStores } from '../database/storesDb';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  await app.listen(process.env.PORT ?? 3000);
  
  // Инициализация базы данных
  await initStore().catch((error) => {
    console.error('Ошибка при заполнении базы данных:', error);
  });
  
  // Создание экземпляра ProductsService
  const productsService = app.get(ProductsService);

  // Инициализация браузера
  await productsService.initBrowser();

  // Получение всех магазинов из базы данных
  let stores;
  try {
    stores = await getAllStores();
    if (stores.length === 0) {
      console.error('Нет доступных магазинов в базе данных.');
      return;
    }
  } catch (error) {
    console.error(`Ошибка при получении магазинов: ${error.message}`);
    return;
  }

  // Обработка каждого магазина по очереди
  for (const store of stores) {
    const storeId = store.id; // Используем id текущего магазина
    console.log(`Начинаем обработку магазина с ID: ${storeId}`);
    
    try {
      const addedProductIds = await productsService.scrapeAllProducts(storeId); // Передаем идентификатор
      console.log(`Общее количество добавленных продуктов: ${addedProductIds.length}`);
      console.log(`Добавленные продукты с ID из магазина ${storeId}:`, addedProductIds);
    } catch (error) {
      console.error(`Ошибка при скрейпинге продуктов из магазина с ID ${storeId}: ${error.message}`);
    }
    
    // Задержка перед обработкой следующего магазина (например, 2 секунды)
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Закрытие браузера после завершения работы
  await productsService.closeBrowser();
}

bootstrap().catch(error => {
  console.error('Ошибка при инициализации приложения:', error);
  process.exit(1); // Завершение процесса с кодом ошибки
});
