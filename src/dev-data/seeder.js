const dotenv = require('dotenv');
const mongoose = require('mongoose');
const fs = require('fs');

const Product = require('../models/productModel');
const User = require('../models/userModel');
const ShippingAddress = require('../models/shippingAddressModel');
const Review = require('../models/reviewModel');
const Category = require('../models/categoryModel');
const Discount = require('../models/discountModel');

dotenv.config({ path: './.env' });

const products = JSON.parse(
  fs.readFileSync(`${__dirname}/products.json`, 'utf-8')
);
const users = JSON.parse(fs.readFileSync(`${__dirname}/users.json`, 'utf-8'));
const shippingAddresses = JSON.parse(
  fs.readFileSync(`${__dirname}/shipping-addresses.json`, 'utf-8')
);
const reviews = JSON.parse(
  fs.readFileSync(`${__dirname}/reviews.json`, 'utf-8')
);
const categories = JSON.parse(
  fs.readFileSync(`${__dirname}/categories.json`, 'utf-8')
);
const discounts = JSON.parse(
  fs.readFileSync(`${__dirname}/discounts.json`, 'utf-8')
);

const connectionString = process.env.DB_CONNECTION.replace(
  '<PASSWORD>',
  process.env.DB_PASSWORD
);

mongoose.connect(connectionString);

async function importData() {
  try {
    // await Product.create(products);
    // await User.create(users);
    // await ShippingAddress.create(shippingAddresses);
    // await Review.create(reviews);

    await Promise.all([
      Product.create(products),
      User.create(users),
      ShippingAddress.create(shippingAddresses),
      Review.create(reviews),
      Category.create(categories),
      Discount.create(discounts),
    ]);

    console.log('Data imported successfully');
  } catch (error) {
    console.error(error);
  } finally {
    process.exit();
  }
}

async function deleteData() {
  try {
    await Promise.all([
      Product.deleteMany(),
      User.deleteMany(),
      ShippingAddress.deleteMany(),
      Review.deleteMany(),
      Category.deleteMany(),
      Discount.deleteMany(),
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
