import { Controller, Get, Param } from '@nestjs/common';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productService: ProductsService) {}

  @Get(':storeId')
  async scrapeProducts(@Param('storeId') storeId: number) {
    try {
      const productIds = await this.productService.scrapeAllProducts(storeId);
      return { productIds };
    } catch (error) {
      console.error(`Ошибка при получении магазина или сканировании продуктов: ${error.message}`);
      return { message: 'Internal server error' };
    }
  }

  @Get('hello')
  getHello() {
    return this.productService.getHello(); // Убедитесь, что этот метод существует
  }
}
