const dotenv = require('dotenv');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
dotenv.config();

if (!process.env.SQLITE_STORE_DB_PATH) {
  console.error('Переменная окружения SQLITE_STORE_DB_PATH не определена.');
  process.exit(1);
}

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
      selectors TEXT NOT NULL);`, (err) => {
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
    const { name, baseUrl, selectors } = store;

    // Проверяем, существует ли магазин с таким же baseUrl
    db.get('SELECT * FROM stores WHERE baseUrl = ?', [baseUrl], (err, row) => {
      if (err) {
        return reject(err);
      }
      if (row) {
        console.log(`Магазин с baseUrl ${baseUrl} уже существует.`);
        return resolve(null); 
      }

      // Если магазин не существует, добавляем его
      db.run(
        `INSERT INTO stores (name, baseUrl, selectors) VALUES (?, ?, ?)`,
        [name, baseUrl, selectors],
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

async function seedDatabase() {
  const stores = [
    {
      name: "sima-land",
      baseUrl: "https://www.sima-land.ru",
      selectors: JSON.stringify({
        default: {
          categorySelector: ".xaisxI",
          subcategorySelector: ".YbL5v0",
          productSelector: ".catalog__item",
          nameSelector: ".jBE82l",
          priceSelector: ".XJIe4q",
          linkSelector: ".papCzt",
          nextPageSelector: 'MoSdWj rounds-undefined qJdE0d'
        },
        alternatives: [  
          {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: ".uPrDSV",
            nameSelector: ".CE21s_",
            priceSelector: ".F9iyS4",
            linkSelector: ".mFm_11",
            nextPageSelector: 'MoSdWj rounds-undefined qJdE0d'
          },
          {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: ".XqxjOo",
            nameSelector: ".CE21s_",
            priceSelector: ".F9iyS4",
            linkSelector: ".mFm_11",
            nextPageSelector: 'MoSdWj rounds-undefined qJdE0d'
          },
          {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: "Dvg2Gs HXhk0s f3iB48 fZvA3t hBeZbE VU0VGY",
            nameSelector: "FnmiaU z4n3de zdQcLA",
            priceSelector: "a2ZUfY bdgC2_",
            linkSelector: ".w12a69",
            nextPageSelector: 'MoSdWj rounds-undefined qJdE0d'
          },
           {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: ".cYJE9y",
            nameSelector: "FnmiaU z4n3de zdQcLA",
            priceSelector: "a2ZUfY bdgC2_",
            linkSelector: ".w12a69",
            nextPageSelector: 'MoSdWj rounds-undefined qJdE0d'
          },
          {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: "dX0DkK AMtfke",
            nameSelector: ".jBE82l",
            priceSelector: ".pWnr5j",
            linkSelector: "odeaio UtSouE PfpX13",
            nextPageSelector: 'MoSdWj rounds-undefined qJdE0d'
          },
          {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: "dX0DkK AMtfke",
            nameSelector: ".jBE82l",
            priceSelector: ".pWnr5j",
            linkSelector: "odeaio UtSouE PfpX13",
            nextPageSelector: 'MoSdWj Ky7lus qJdE0d'
          },
          {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: "dX0DkK AMtfke",
            nameSelector: "FnmiaU z4n3de zdQcLA",
            priceSelector: "a2ZUfY bdgC2_",
            linkSelector: ".w12a69",
            nextPageSelector: 'MoSdWj Ky7lus qJdE0d'
          },
          {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: ".EMELMd",
            nameSelector: "iSNGG7",
            priceSelector: "C1_ch0 TsXWER",
            linkSelector: ".P7zI0P",
            nextPageSelector: 'MoSdWj Ky7lus qJdE0d'
          },
          {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: "Tjryv6 jMV4W3 m5Eg__ catalog__item m358ND AVScRl",
            nameSelector: "iSNGG7",
            priceSelector: "C1_ch0 TsXWER",
            linkSelector: ".P7zI0P",
            nextPageSelector: 'MoSdWj Ky7lus qJdE0d'
          },
          {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: "Tjryv6 jMV4W3 m5Eg__ catalog__item m358ND AVScRl",
            nameSelector: ".o7U8An",
            priceSelector: ".XJIe4q",
            linkSelector: "odeaio papCzt PfpX13",
            nextPageSelector: 'MoSdWj rounds-undefined qJdE0d'
          },
          {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: ".J1tO96",
            nameSelector: "FnmiaU z4n3de",
            priceSelector: "a2ZUfY bdgC2_",
            linkSelector: ".w12a69",
            nextPageSelector: 'MoSdWj rounds-undefined qJdE0d'
          },
          {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: ".NvlRoB",
            nameSelector: "FnmiaU z4n3de",
            priceSelector: "a2ZUfY bdgC2_",
            linkSelector: ".w12a69",
            nextPageSelector: 'MoSdWj rounds-undefined qJdE0d'
          },
        ]
      }),
    },
    {
      name: "leran.pro",
      baseUrl: "https://www.leran.pro",
      selectors: JSON.stringify({
        default: {
          categorySelector: ".catalogue-info__image",
          subcategorySelector: ".catalogue-info__image",
          productSelector: "item-catalogue catalogue-list-item",
          nameSelector: ".item-catalogue__item-name-link",
          priceSelector: ".price__row_current",
          linkSelector: ".item-catalogue__image",
          nextPageSelector: 'div.paginator-more.item-catalogue-list__paginator-more > span.paginator-more__part.paginator-more__show'
        },
        alternatives: [
          {
            categorySelector: ".catalogue-info__image",
            subcategorySelector: ".catalogue-info__image",
            productSelector: "item-catalogue catalogue-list-item",
            nameSelector: ".item-catalogue__item-name",
            priceSelector: ".price__row_current",
            linkSelector: "image-link item-catalogue__image",
            nextPageSelector: 'div.paginator-more.item-catalogue-list__paginator-more > span.paginator-more__part.paginator-more__show'
          }
        ]
      }),
    },
    {
      name: "ReStore",
      baseUrl: "https://re-store.ru",
      selectors: JSON.stringify({
        default: {
          categorySelector: ".card__full",
          subcategorySelector: ".card__full",
          productSelector: ".product-card",
          nameSelector: ".product-card__title",
          priceSelector: ".product-card__prices",
          linkSelector: ".product-card__link",
          nextPageSelector: 'button.btn.btn--black.btn--size-sm.btn--full-width'
        },
        alternatives: [
          {
            categorySelector: ".alternative-category",
            subcategorySelector: ".alternative-subcategory",
            productSelector: ".alternative-product-card",
            nameSelector: ".alternative-product-title",
            priceSelector: ".alternative-product-prices",
            linkSelector: ".alternative-product-link",
            nextPageSelector: '.alternative-nextPage'
          }
        ]
      }),
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
    await initDatabase();
    await seedDatabase(); 
    const stores = await getAllStores(); 
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
      resolve(row); 
    });
  });
}


module.exports = {
  db, 
  addStore,
  getAllStores,
  seedDatabase,
  initStore,
  closeDatabase,
  getStoreById 
};
