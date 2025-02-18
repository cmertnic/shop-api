import { Controller, Get, Param } from '@nestjs/common';
import { ProductsService } from './products.service';
import { getAllProducts as getAllProductsFromDb, getProductByNameAndUrl, addProduct, updateProduct } from '../../database/productDb';
@Controller('products')
export class ProductsController {
  constructor(private readonly productService: ProductsService) {}

  @Get('all')
  async getAllProducts() {
    try {
      const products = await getAllProductsFromDb();
      return { products };
    } catch (error) {
      console.error(`Ошибка при получении всех продуктов: ${error.message}`);
      return { message: 'Internal server error' };
    }
  }

  @Get('hello')
  getHello() {
    return this.productService.getHello(); 
  }
}

