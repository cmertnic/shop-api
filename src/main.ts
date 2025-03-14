import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ProductsService } from './products/products.service'; 
import { initStore, getAllStores } from '../database/storesDb';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  const PORT = process.env.PORT ?? 3000;
  await app.listen(PORT);
  
  console.log(`Приложение запущено на http://localhost:${PORT}`);

  // Инициализация базы данных
  await initStore().catch((error) => {
    console.error('Ошибка при заполнении базы данных:', error);
  });
  
  const productsService = app.get(ProductsService);

  // Инициализация браузера
  await productsService.initBrowser();

  // Функция для обработки магазинов
  const processStores = async () => {
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
      const storeId = store.id;
      console.log(`Начинаем обработку магазина с ID: ${storeId}`);
      
      try {
        const addedProductIds = await productsService.scrapeAllProducts(storeId); 
        console.log(`Общее количество добавленных продуктов: ${addedProductIds.length}`);
        console.log(`Добавленные продукты с ID из магазина ${storeId}:`, addedProductIds);
      } catch (error) {
        console.error(`Ошибка при скрейпинге продуктов из магазина с ID ${storeId}: ${error.message}`);
      }
      
      // Задержка перед обработкой следующего магазина 
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  };

  setTimeout(async () => {
    console.log('Запуск обработки магазинов...');
    await processStores();

    setInterval(async () => {
      console.log('Запуск периодической обработки магазинов...');
      await processStores();
    }, 1800000); 
  }, 10000); 

  // Закрытие браузера после завершения работы
  process.on('exit', async () => {
    await productsService.closeBrowser();
  });
}

bootstrap().catch(error => {
  console.error('Ошибка при инициализации приложения:', error);
  process.exit(1); 
});
