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
    // {
    //   name: "eldorado",
    //   baseUrl: "https://www.eldorado.ru",
    //   selectors: JSON.stringify({
    //     default: {
    //       categorySelector: "Kr",
    //       subcategorySelector: "eld-button",
    //       productSelector: "Eo Gq",
    //       nameSelector: "Sm",
    //       priceSelector: "Ym",
    //       linkSelector: "Hm",
    //       imageSelector: "Km",
    //       nextPageSelector: 'Az Bz'
    //     },
    //     alternatives: [
    //       {
    //         categorySelector: "Kr",
    //         subcategorySelector: "eld-button",
    //         productSelector: "WU",
    //         nameSelector: "eV",
    //         priceSelector: "S4 _4",
    //         linkSelector: "cw dw",
    //         imageSelector: "uD",
    //         nextPageSelector: 'Az Bz'
    //       },
    //       {
    //         categorySelector: "Fr",
    //         subcategorySelector: "eld-button",
    //         productSelector: "Fm",
    //         nameSelector: "Sm",
    //         priceSelector: "S4 _4",
    //         linkSelector: "Hm",
    //         imageSelector: "Km",
    //         nextPageSelector: 'Az Bz'
    //       },
    //       {
    //         categorySelector: "Fr",
    //         subcategorySelector: "eld-button",
    //         productSelector: "Ws",
    //         nameSelector: "Ny",
    //         priceSelector: "My",
    //         linkSelector: "Ey",
    //         imageSelector: "Km",
    //         nextPageSelector: 'lK uK pK'
    //       },
    //     ]
    //   }),
    // },
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
          imageSelector: ".product-card__image",
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
            imageSelector: ".jwFsP1",
            nextPageSelector: 'MoSdWj rounds-undefined qJdE0d'//https://www.sima-land.ru
          },
          {
            categorySelector: "dBzXXo ia3wHg xH9dDn",
            subcategorySelector: "dBzXXo ia3wHg xH9dDn",
            subcategorySelector: ".YbL5v0",
            productSelector: ".XqxjOo",
            nameSelector: ".CE21s_",
            priceSelector: ".F9iyS4",
            linkSelector: ".mFm_11",
            imageSelector: ".product-card__image",
            nextPageSelector: 'MoSdWj rounds-undefined qJdE0d'
          },
          {
            categorySelector: "odeaio SwS6Lz PfpX13",
            subcategorySelector: "odeaio SwS6Lz PfpX13",
            productSelector: "Dvg2Gs HXhk0s f3iB48 fZvA3t hBeZbE VU0VGY",
            nameSelector: "FnmiaU z4n3de zdQcLA",
            priceSelector: "a2ZUfY bdgC2_",
            linkSelector: ".w12a69",
            imageSelector: ".lT9Ljs",//https://www.sima-land.ru/igrushki/?banner_catalog_banner=49623&chpnk=1
            nextPageSelector: 'MoSdWj rounds-undefined qJdE0d'
          },
           {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: ".cYJE9y",
            nameSelector: "FnmiaU z4n3de zdQcLA",
            priceSelector: "a2ZUfY bdgC2_",
            linkSelector: ".w12a69",
            imageSelector: ".lT9Ljs",//https://www.sima-land.ru/prazdniki/?banner_catalog_banner=50865&chpnk=1
            nextPageSelector: 'MoSdWj rounds-undefined qJdE0d'
          },
          {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: "dX0DkK AMtfke",
            nameSelector: ".jBE82l",
            priceSelector: ".pWnr5j",
            linkSelector: "odeaio UtSouE PfpX13",
            imageSelector: ".ec1EMM",
            nextPageSelector: 'MoSdWj rounds-undefined qJdE0d'
          },
          {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: "MUI7n2",
            nameSelector: "FUK7oh jIWtAO",
            priceSelector: ".OmGIUl",
            linkSelector: "FUK7oh jIWtAO",
            imageSelector: ".dwb1m5",//https://www.sima-land.ru/10341524/antistress-skvish-myalka-uletnyy-zhmyak-7-cm-pasta/
            nextPageSelector: 'MoSdWj rounds-undefined qJdE0d'
          },
          {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: "dX0DkK AMtfke",
            nameSelector: ".jBE82l",
            priceSelector: ".pWnr5j",
            linkSelector: "odeaio oGSri3",
            imageSelector: ".ec1EMM",//https://www.sima-land.ru/podarochnye-nabory-na-23-fevralya/?banner_main=54786&chpnk=1&viewtype=cards
            nextPageSelector: 'MoSdWj CheG6i WwH2wJ'
          },
          {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: "_6SV5p",
            nameSelector: "._9EfqO",
            priceSelector: ".C1_ch0 X8KFZ9",
            linkSelector: "odeaio oGSri3",
            imageSelector: ".zdyGoQ",//https://www.sima-land.ru/3868687/yaschik-dlya-rassady-45-20-10-cm-s-ruchkami-6-l-plastik-chernyy
            nextPageSelector: 'MoSdWj CheG6i WwH2wJ'
          },
          {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: "_6SV5p",
            nameSelector: "._9EfqO",
            priceSelector: ".C1_ch0 X8KFZ9",
            linkSelector: "odeaio oGSri3",
            imageSelector: "DFqq_K HdtV8B",//https://www.sima-land.ru/3868687/yaschik-dlya-rassady-45-20-10-cm-s-ruchkami-6-l-plastik-chernyy
            nextPageSelector: 'MoSdWj CheG6i WwH2wJ'
          },
          {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: "dX0DkK AMtfke",
            nameSelector: ".jBE82l",
            priceSelector: ".pWnr5j",
            linkSelector: "odeaio oGSri3",
            imageSelector: ".ec1EMM",//https://www.sima-land.ru/podarochnye-nabory-na-23-fevralya/?banner_main=54786&chpnk=1&viewtype=cards
            nextPageSelector: 'MoSdWj Ky7lus qJdE0d'
          },
          {
            categorySelector: ".mufu24",
            subcategorySelector: ".mufu24",
            productSelector: "Tjryv6 jMV4W3 m5Eg__ catalog__item m358ND AVScRl",
            nameSelector: ".jBE82l",
            priceSelector: ".XJIe4q",
            linkSelector: "odeaio papCzt PfpX13",
            imageSelector: ".DjV7uU",//https://www.sima-land.ru/podarochnye-nabory-na-23-fevralya/?banner_main=54786&chpnk=1&viewtype=cards
            nextPageSelector: 'MoSdWj Ky7lus qJdE0d'
          },
          {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: "dX0DkK AMtfke",
            nameSelector: ".jBE82l",
            priceSelector: ".pWnr5j",
            linkSelector: "odeaio UtSouE PfpX13",
            imageSelector: ".ec1EMM",
            nextPageSelector: 'MoSdWj Ky7lus qJdE0d'
          },
          {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: "dX0DkK AMtfke",
            nameSelector: "FnmiaU z4n3de zdQcLA",
            priceSelector: "a2ZUfY bdgC2_",
            linkSelector: ".w12a69",
            imageSelector: ".ec1EMM",
            nextPageSelector: 'MoSdWj Ky7lus qJdE0d'
          },
          {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: ".EMELMd",
            nameSelector: "iSNGG7",
            priceSelector: "C1_ch0 TsXWER",
            linkSelector: ".P7zI0P",
            imageSelector: ".product-card__image",
            nextPageSelector: 'MoSdWj Ky7lus qJdE0d'
          },
          {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: "Tjryv6 jMV4W3 m5Eg__ catalog__item m358ND AVScRl",
            nameSelector: ".iSNGG7",
            priceSelector: "C1_ch0 TsXWER",
            linkSelector: ".P7zI0P",
            imageSelector: ".product-card__image",
            nextPageSelector: 'MoSdWj Ky7lus qJdE0d'
          },
          {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: "Tjryv6 jMV4W3 m5Eg__ catalog__item m358ND AVScRl",
            nameSelector: ".jBE82l",
            priceSelector: "C1_ch0 TsXWER",
            linkSelector: ".P7zI0P",
            imageSelector: ".product-card__image",
            nextPageSelector: 'MoSdWj Ky7lus qJdE0d'
          },
          {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: "Tjryv6 jMV4W3 m5Eg__ catalog__item m358ND AVScRl",
            nameSelector: ".o7U8An",
            priceSelector: ".XJIe4q",
            linkSelector: "odeaio papCzt PfpX13",
            imageSelector: ".DjV7uU",//https://www.sima-land.ru/termobele/?banner_banner_dust_cover=52075&chpnk=1&per-page=100&sort=discount&viewtype=cards
            nextPageSelector: 'MoSdWj CheG6i WwH2wJ'
          },
          {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: ".ln6TuA",
            nameSelector: "odeaio EUvKfA",
            priceSelector: ".fWlZy4",
            linkSelector: "odeaio EUvKfA",
            imageSelector: ".RfZDto",//https://www.sima-land.ru/termobele/?banner_banner_dust_cover=52075&chpnk=1&per-page=100&sort=discount&viewtype=cards
            nextPageSelector: 'MoSdWj CheG6i WwH2wJ'
          },
          {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: ".J1tO96",
            nameSelector: "FnmiaU z4n3de",
            priceSelector: "a2ZUfY bdgC2_",
            linkSelector: ".w12a69",
            imageSelector: ".lT9Ljs",//https://www.sima-land.ru/podborki-tovarov-dlya-dachi/?banner_banner_dust_cover=54975&chpnk=1
            nextPageSelector: 'MoSdWj rounds-undefined qJdE0d'
          },
          {
            categorySelector: ".xaisxI",
            subcategorySelector: ".YbL5v0",
            productSelector: ".NvlRoB",
            nameSelector: "FnmiaU z4n3de zdQcLA zFQi4D NFFioy",
            priceSelector: "a2ZUfY bdgC2_",
            linkSelector: ".w12a69",
            imageSelector: ".lT9Ljs",//https://www.sima-land.ru/podborki-tovarov-dlya-dachi/?banner_banner_dust_cover=54975&chpnk=1
            nextPageSelector: 'MoSdWj rounds-undefined qJdE0d'
          },
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
          imageSelector: "v-lazy-image v-lazy-image-loaded",
          nextPageSelector: 'btn btn--black btn--size-sm btn--full-width'
        },
        alternatives: [
          {
            categorySelector: ".card__full",
            subcategorySelector: ".card__full",
            productSelector: ".detail__inner",
            nameSelector: ".detail-heading__heading",
            priceSelector: ".detail-price__current",
            linkSelector: ".product-card__link",
            imageSelector: ".slides-swiper__main-image",
            nextPageSelector: 'link text-small link--black'
          },
          {
            categorySelector: ".card__full",
            subcategorySelector: ".card__full",
            productSelector: "popular-products__item product-card product-card--hovered",
            nameSelector: ".product-card__title",
            priceSelector: ".product-card__prices",
            linkSelector: ".product-card__link",
            imageSelector: "v-lazy-image v-lazy-image-loaded",
            nextPageSelector: 'link text-small link--black'
          },
          {
            categorySelector: ".card__full",
            subcategorySelector: ".card__full",
            productSelector: "catalog__product product-card product-card--hovered",
            nameSelector: ".product-card__title",
            priceSelector: ".product-card__prices",
            linkSelector: ".product-card__link",
            imageSelector: "product-card__image product-card__image--changeable",
            nextPageSelector: 'link text-small link--black'
          },
          {
            categorySelector: ".card__full",
            subcategorySelector: ".card__full",
            productSelector: "popular-products__item product-card product-card--hovered",
            nameSelector: ".product-card__title",
            priceSelector: ".product-card__prices",
            linkSelector: ".product-card__link",
            imageSelector: ".v-lazy-image.v-lazy-image-loaded",
            nextPageSelector: 'link text-small link--black'
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
