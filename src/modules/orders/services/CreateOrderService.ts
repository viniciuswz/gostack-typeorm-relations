import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,
    @inject('CustomerRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const hasUser = await this.customersRepository.findById(customer_id);
    if (!hasUser) {
      throw new AppError('Cannot create a order from a non-exist user');
    }

    const productsId = products.map(product => ({ id: product.id }));
    const hasProducts = await this.productsRepository.findAllById(productsId);
    if (hasProducts.length < products.length) {
      throw new AppError('Cannot create a order with a non-exist product');
    }

    const hasAvailableMinimumQuantity = hasProducts.some((product, index) => {
      const quantityToBuy = products[index].quantity;

      const remaingProduct = product.quantity;
      const remaingSimulation = remaingProduct - quantityToBuy;
      return remaingSimulation < 0 || quantityToBuy === 0;
    });
    if (hasAvailableMinimumQuantity) {
      throw new AppError(
        'Cannot create a order with a unavailable product quantity',
      );
    }

    const productsToOrder = hasProducts.map(product => ({
      product_id: product.id,
      price: product.price,
      quantity: products.filter(productItem => productItem.id === product.id)[0]
        .quantity,
    }));

    const order = await this.ordersRepository.create({
      customer: hasUser,
      products: productsToOrder,
    });

    const productsToUpdate = productsToOrder.map(product => ({
      id: product.product_id,
      quantity:
        hasProducts.filter(item => item.id === product.product_id)[0].quantity -
        product.quantity,
    }));

    await this.productsRepository.updateQuantity(productsToUpdate);

    return order;
  }
}

export default CreateOrderService;
