const dotenv = require('dotenv');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

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
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error(`Ошибка при подключении к базе данных: ${err.message}`);
    process.exit(1);
  }
  console.log('Подключено к базе данных товаров');
});

// Функция для создания таблицы stores
function initDatabase() {
  return new Promise((resolve, reject) => {
    db.run(`CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      baseUrl TEXT NOT NULL UNIQUE,
      categorySelector TEXT NOT NULL,
      subcategorySelector TEXT,  -- Новый столбец для селектора подкатегорий
      productSelector TEXT NOT NULL,
      nameSelector TEXT NOT NULL,
      priceSelector TEXT NOT NULL,
      linkSelector TEXT NOT NULL,
      nextPageSelector TEXT NOT NULL  -- Новый столбец для селектора следующей страницы
    );`, (err) => {
      if (err) {
        console.error(`Ошибка при создании таблицы stores: ${err.message}`);
        reject(err);
      } else {
        console.log('Таблица stores создана');
        resolve();
      }
    });
  });
}

// Функция для добавления магазина в базу данных
async function addStore(store) {
  return new Promise((resolve, reject) => {
    const { name, baseUrl, categorySelector, subcategorySelector, productSelector, nameSelector, priceSelector, linkSelector, nextPageSelector } = store;

    // Проверяем, существует ли магазин с таким же baseUrl
    db.get('SELECT * FROM stores WHERE baseUrl = ?', [baseUrl], (err, row) => {
      if (err) {
        return reject(err);
      }
      if (row) {
        return resolve(null); // Возвращаем null, если магазин уже существует
      }

      // Если магазин не существует, добавляем его
      db.run(
        `INSERT INTO stores (name, baseUrl, categorySelector, subcategorySelector, productSelector, nameSelector, priceSelector, linkSelector, nextPageSelector) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, baseUrl, categorySelector, subcategorySelector, productSelector, nameSelector, priceSelector, linkSelector, nextPageSelector],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  });
}

// Функция для получения всех магазинов из базы данных
function getAllStores() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM stores', [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Функция для создания задержки
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function seedDatabase() {
  const stores = [
    {
      name: "sima-land",
      baseUrl: "https://www.sima-land.ru",
      categorySelector: ".xaisxI",
      subcategorySelector: ".YbL5v0", 
      productSelector: ".catalog__item",
      nameSelector: ".jBE82l",
      priceSelector: ".XJIe4q",
      linkSelector: ".papCzt",
      nextPageSelector: 'a[aria-label="Следующая страница"]' 
    },
    {
      name: "lemanapro",
      baseUrl: "https://lemanapro.ru",
      categorySelector: ".gwlXjiSOOU_main-page",
      subcategorySelector: ".gwlXjiSOOU_main-page",
      productSelector: ".largeCard",
      nameSelector: ".pblwt5z_plp",
      priceSelector: ".mvc4syb_plp",
      linkSelector: ".ihytpj4_plp",
      nextPageSelector: 'a.bex6mjh_plp[data-qa-pagination-item="right"]' 
    },
    {
      name: "leran.pro",
      baseUrl: "https://www.leran.pro",
      categorySelector: ".catalogue-info__image",
      subcategorySelector: ".catalogue-info__image",
      productSelector: ".item-catalogue.catalogue-list-item",
      nameSelector: ".item-catalogue__item-name-link",
      priceSelector: ".price__row_current",
      linkSelector: ".item-catalogue__image",
      nextPageSelector: 'div.paginator-more.item-catalogue-list__paginator-more > span.paginator-more__part.paginator-more__show' 
    },
    {
      name: "ReStore",
      baseUrl: "https://re-store.ru",
      categorySelector: ".card__full",
      subcategorySelector: ".card__full",
      productSelector: ".product-card",
      nameSelector: ".product-card__title",
      priceSelector: ".product-card__prices",
      linkSelector: ".product-card__link",
      nextPageSelector: 'button.btn.btn--black.btn--size-sm.btn--full-width' 
    }
  ];

  for (const store of stores) {
    try {
      const id = await addStore(store);
      if (id) {
        console.log(`Магазин ${store.name} добавлен с ID ${id}`);
      }
    } catch (error) {
      console.error(`Ошибка при добавлении магазина ${store.name}: ${error.message}`);
    }
  }
}

// Инициализация базы данных и добавление магазинов
async function initStore() {
  try {
    await initDatabase(); // Создание таблицы
    await seedDatabase(); // Заполнение таблицы начальными данными
    const stores = await getAllStores(); // Получение всех магазинов для проверки
    console.log(stores);
  } catch (error) {
    console.error(`Ошибка инициализации базы данных: ${error.message}`);
  }
}

// Функция для закрытия базы данных (при необходимости)
function closeDatabase() {
  db.close((err) => {
    if (err) {
      console.error(`Ошибка при закрытии базы данных: ${err.message}`);
    } else {
      console.log('База данных закрыта');
    }
  });
}

// Функция для получения магазина по ID
function getStoreById(storeId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM stores WHERE id = ?', [storeId], (err, row) => {
      if (err) {
        return reject(err);
      }
      resolve(row); // Возвращаем найденный магазин или null, если не найден
    });
  });
}

// Экспортируем функции для использования в других модулях
module.exports = {
  db, // Экспортируем соединение с базой данных
  addStore,
  getAllStores,
  seedDatabase,
  initStore,
  closeDatabase,
  getStoreById 
};
