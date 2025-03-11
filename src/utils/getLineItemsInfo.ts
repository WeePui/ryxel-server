import Product from '../models/productModel';
import AppError from './AppError';

interface LineItem {
  product: string;
  variant: string;
  quantity: number;
}

export const getLineItemsInfo = async (lineItems: LineItem[]) => {
  return await Promise.all(
    lineItems.map(async (item: any) => {
      const product = await Product.findById(item.product);

      if (!product) {
        throw new Error('Product not found');
      }

      const variant = product.variants.find(
        (variant: any) => variant._id.toString() === item.variant.toString()
      );

      if (!variant) {
        throw new Error('Variant not found');
      }

      variant.name = product.name + ' - ' + variant.name;

      return { variant, quantity: item.quantity };
    })
  );
};
