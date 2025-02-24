const dotenv = require('dotenv');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

dotenv.config();

if (!process.env.SQLITE_PRODUCT_DB_PATH) {
  console.error('Переменная окружения SQLITE_PRODUCT_DB_PATH не определена.');
  process.exit(1);
}
const dbPath = path.resolve(process.env.SQLITE_PRODUCT_DB_PATH);

// Создаем новое подключение к базе данных
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error(`Ошибка при подключении к базе данных: ${err.message}`);
    process.exit(1);
  }
  console.log('Подключено к базе данных продуктов');
});

db.run(`CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price TEXT NOT NULL,  
  img TEXT,          
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
  const { name, url, price, img } = product;

  if (!name || !url || price === undefined || price === null) {
    console.error(`Не удалось добавить продукт: обязательные поля не заполнены. Продукт: ${JSON.stringify(product)}`);
    return;
  }

  const existingProduct = await getProductByNameAndUrl(name, url);

  if (existingProduct) {
    if (existingProduct.price !== price) {
      const oldPrice = existingProduct.price; // Сохраняем старую цену
      product.id = existingProduct.id; 
      await updateProduct(product); 
      console.log(`Обновлен продукт: ${product.name} с ID: ${existingProduct.id}. Цена изменена с ${oldPrice} на ${price}.`);
    }
    return existingProduct.id; 
  }

  // Если продукт не существует, добавляем его в базу данных
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO products (name, price, img, url) VALUES (?, ?, ?, ?)`,
      [name, price, img, url],
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
    const { id, name, price, img, url } = product;

    db.run(
      `UPDATE products SET name = ?, price = ?, img = ?, url = ? WHERE id = ?`,
      [name, price, img, url, id],
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

module.exports = {
  addProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  findProductByName,
  getProductByNameAndUrl
};

