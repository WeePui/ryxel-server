import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'fs';
import { Document } from 'mongoose';

import Product from '../models/productModel';
import User from '../models/userModel';
import ShippingAddress from '../models/shippingAddressModel';
import Review from '../models/reviewModel';
import Category from '../models/categoryModel';
import Discount from '../models/discountModel';
import Order from '../models/orderModel';

dotenv.config({ path: './.env' });

const products: Document[] = JSON.parse(
  fs.readFileSync(`${__dirname}/products.json`, 'utf-8')
);
const users: Document[] = JSON.parse(
  fs.readFileSync(`${__dirname}/users.json`, 'utf-8')
);
const shippingAddresses: Document[] = JSON.parse(
  fs.readFileSync(`${__dirname}/shipping-addresses.json`, 'utf-8')
);
const reviews: Document[] = JSON.parse(
  fs.readFileSync(`${__dirname}/reviews.json`, 'utf-8')
);
const categories: Document[] = JSON.parse(
  fs.readFileSync(`${__dirname}/categories.json`, 'utf-8')
);
const discounts: Document[] = JSON.parse(
  fs.readFileSync(`${__dirname}/discounts.json`, 'utf-8')
);
const orders: Document[] = JSON.parse(
  fs.readFileSync(`${__dirname}/orders.json`, 'utf-8')
);

const connectionString: string = process.env.DB_CONNECTION!.replace(
  '<PASSWORD>',
  process.env.DB_PASSWORD!
);

mongoose.connect(connectionString);

async function importData(): Promise<void> {
  try {
    await Product.create(products);

    await Promise.all([
      User.create(users),
      ShippingAddress.create(shippingAddresses),
      Category.create(categories),
      Discount.create(discounts),
    ]);

    await Promise.all([Review.create(reviews), Order.create(orders)]);

    console.log('Data imported successfully');
  } catch (error) {
    console.error(error);
  } finally {
    process.exit();
  }
}

async function deleteData(): Promise<void> {
  try {
    await Promise.all([
      Product.deleteMany({}),
      User.deleteMany({}),
      ShippingAddress.deleteMany({}),
      Review.deleteMany({}),
      Category.deleteMany({}),
      Discount.deleteMany({}),
      Order.deleteMany({}),
    ]);

    console.log('Data deleted successfully');
  } catch (error) {
    console.error(error);
  } finally {
    process.exit();
  }
}

switch (process.argv[2]) {
  case '--import':
    importData();
    break;
  case '--delete':
    deleteData();
    break;
  // default: {
  //   console.log('Please provide a valid argument');
  //   process.exit();
  // }
}
