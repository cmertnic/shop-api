// Подключаем необходимые модули
const dotenv = require('dotenv');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Загружаем переменные окружения из файла .env
dotenv.config();

// Проверяем наличие переменной окружения SQLITE_PRODUCT_DB_PATH
if (!process.env.SQLITE_PRODUCT_DB_PATH) {
  console.error('Переменная окружения SQLITE_PRODUCT_DB_PATH не определена.');
  process.exit(1);
}

// Получаем путь к базе данных из переменной окружения
const dbPath = path.resolve(process.env.SQLITE_PRODUCT_DB_PATH);

// Создаем новое подключение к базе данных
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error(`Ошибка при подключении к базе данных: ${err.message}`);
    process.exit(1);
  }
  console.log('Подключено к базе данных продуктов');
});

// Создаем таблицу products, если она еще не создана
db.run(`CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  description TEXT,
  url TEXT
);`, (err) => {
  if (err) {
    console.error(`Ошибка при создании таблицы products: ${err.message}`);
    process.exit(1);
  }
  console.log('Таблица products создана');
});

// Функция для добавления или обновления товара в базу данных
async function addProduct(product) {
  const { name, url, price, description } = product;

  // Проверяем, что обязательные поля заполнены
  if (!name || !url || price === undefined || price === null) {
    console.error(`Не удалось добавить продукт: обязательные поля не заполнены. Продукт: ${JSON.stringify(product)}`);
    return;
  }

  // Проверяем, существует ли товар с таким же названием и ссылкой
  const existingProduct = await getProductByNameAndUrl(name, url);

  if (existingProduct) {
    // Если продукт существует, проверяем, изменилось ли его значение цены
    if (existingProduct.price !== price) {
      product.id = existingProduct.id; // Сохраняем ID для обновления
      await updateProduct(product); // Обновляем продукт в базе данных
      console.log(`Обновлен продукт: ${product.name} с ID: ${existingProduct.id}`);
    } else {
      console.log(`Продукт ${product.name} с ID: ${existingProduct.id} уже существует и не требует обновления.`);
    }
    return existingProduct.id; // Возвращаем ID существующего товара
  }

  // Если продукт не существует, добавляем его в базу данных
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO products (name, price, description, url) VALUES (?, ?, ?, ?)`,
      [name, price, description, url],
      function (err) {
        if (err) {
          console.error(`Ошибка при добавлении продукта: ${err.message}`);
          reject(err);
        } else {
          console.log(`Добавлен новый продукт: ${name} с ID: ${this.lastID}`);
          resolve(this.lastID);
        }
      }
    );
  });
}

// Функция для получения товара по названию и ссылке из базы данных
function getProductByNameAndUrl(name, url) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM products WHERE name = ? AND url = ?', [name, url], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// Функция для поиска товара по имени
function findProductByName(name) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM products WHERE name = ?', [name], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// Функция для получения всех товаров из базы данных
function getAllProducts() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM products', [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Функция для получения товара по ID из базы данных
function getProductById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM products WHERE id = ?', [id], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// Функция для обновления товара в базе данных
function updateProduct(product) {
  return new Promise((resolve, reject) => {
    const { id, name, price, description, url } = product;

    db.run(
      `UPDATE products SET name = ?, price = ?, description = ?, url = ? WHERE id = ?`,
      [name, price, description, url, id],
      function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      }
    );
  });
}

// Функция для удаления товара из базы данных
function deleteProduct(id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM products WHERE id = ?', [id], function (err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes);
      }
    });
  });
}

// Экспортируем функции для использования в других модулях
module.exports = {
  addProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  findProductByName,
  getProductByNameAndUrl 
};