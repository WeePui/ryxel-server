import { Request, Response, NextFunction } from 'express';
import Product from '../models/productModel';
import APIFeatures from '../utils/apiFeatures';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/AppError';
import { cartProductRecommend, similarProduct } from '../utils/python';

export const aliasTopProducts = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  req.query.limit = '5';
  req.query.sort = '-sold';
  next();
};

export const getAllProducts = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    let apiFeatures = new APIFeatures(Product.find(), req.query);
    apiFeatures = await apiFeatures.search();

    const totalProducts = await apiFeatures.count();

    const resultsPerPage = Number(req.query.limit) || 10;
    apiFeatures.filter().sort().limitFields().paginate();

    const products = await apiFeatures.query.exec();
    const results = await apiFeatures.count();

    res.status(200).json({
      status: 'success',
      data: {
        results,
        totalProducts,
        resultsPerPage,
        products,
      },
    });
  }
);

export const getFilterData = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    let apiFeatures = new APIFeatures(Product.find(), req.query);
    apiFeatures = await apiFeatures.search();
    apiFeatures.filter();

    const allFilteredProducts = await apiFeatures.query
      .select('brand lowestPrice variants.specifications')
      .lean()
      .exec();

    if (allFilteredProducts.length === 0) {
      return res.status(200).json({
        status: 'success',
        data: { brands: [], minPrice: 0, maxPrice: 0, specs: {} },
      });
    }

    // Xử lý brand với count
    const brandCounts = allFilteredProducts.reduce(
      (acc, product) => {
        if (!('brand' in product)) return acc;

        acc[product.brand as string] = (acc[product.brand as string] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const brands = Object.entries(brandCounts).map(([value, count]) => ({
      value,
      count,
    }));

    // Xử lý giá
    const prices = allFilteredProducts.map((p) => {
      if ('lowestPrice' in p) return p.lowestPrice;
      return 0;
    }) as number[];
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    // Xử lý specs với count (theo product)
    const specsWithCounts = allFilteredProducts.reduce(
      (acc, product) => {
        const productSpecs = new Map<string, Set<string>>();
        if (!('variants' in product)) return acc;
        if (!product.variants) return acc;

        // Gom nhóm specs unique theo product
        (product.variants as Array<any>).forEach((variant) => {
          const specs = variant.specifications || {};
          for (const [key, value] of Object.entries(specs)) {
            if (key === 'weight' || !value) continue;

            if (!productSpecs.has(key)) {
              productSpecs.set(key, new Set());
            }
            productSpecs.get(key)?.add(value as string);
          }
        });

        // Thêm count cho từng spec
        productSpecs.forEach((values, key) => {
          if (!acc[key]) acc[key] = {};
          values.forEach((value) => {
            acc[key][value] = (acc[key][value] || 0) + 1;
          });
        });

        return acc;
      },
      {} as Record<string, Record<string, number>>
    );

    // Định dạng đầu ra
    const specs = Object.fromEntries(
      Object.entries(specsWithCounts).map(([key, valueCounts]) => [
        key,
        Object.entries(valueCounts).map(([value, count]) => ({
          value,
          count,
        })),
      ])
    );

    res.status(200).json({
      status: 'success',
      data: { brands, minPrice, maxPrice, specs },
    });
  }
);

export const getProductBySlug = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const product = await Product.findOne({ slug: req.params.slug })
      .populate({ path: 'reviews', match: { status: 'approved' } })
      .lean();

    if (!product) {
      return next(new AppError('No product found with that slug', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        product,
      },
    });
  }
);

export const createProduct = catchAsync(async (req: Request, res: Response) => {
  const product = await Product.create(req.body);

  res.status(201).json({
    status: 'success',
    data: {
      product,
    },
  });
});

export const getProductById = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const product = await Product.findById(req.params.id)
      .populate('reviews')
      .lean();

    if (!product) {
      return next(new AppError('No product found with that ID', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        product,
      },
    });
  }
);

export const updateProduct = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;

    const product = await Product.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!product)
      return next(new AppError('No product found with that ID', 404));

    res.status(200).json({
      status: 'success',
      data: {
        product,
      },
    });
  }
);

export const deleteProduct = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const product = await Product.findByIdAndDelete(id);

    if (!product)
      return next(new AppError('No product found with that ID', 404));

    res.status(204).json({
      status: 'success',
      data: null,
    });
  }
);

export const getSimilarProduct = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { productId } = req.params;
    if (!productId) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing productID in params.',
      });
    }
    const recommendedProducts = await similarProduct(productId);
    if (!recommendedProducts) {
      return res.status(404).json({
        status: 'Fatal error',
        message:
          'No recommended products found. If this is a new product, please retrain the model',
      });
    }

    const productIDs = recommendedProducts.map((rec: any) => rec.productID);
    const totalResults = productIDs.length;
    const products = await Product.find({ _id: { $in: productIDs } })
      .lean()
      .exec();

    res.status(200).json({
      status: 'success',
      results: products.length,
      totalResults,
      data: {
        products,
      },
    });
  }
);

export const getCartProductRecommend = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing productID in params.',
      });
    }

    const recommendedProducts = await cartProductRecommend(productId);
    if (!recommendedProducts) {
      return res.status(404).json({
        status: 'Fatal error',
        message:
          'No recommended products found. If this is a new product, please retrain the model',
      });
    }

    const productIDs = recommendedProducts.map((rec: any) => rec.productID);
    const totalResults = productIDs.length;
    const products = await Product.find({ _id: { $in: productIDs } })
      .lean()
      .exec();

    res.status(200).json({
      status: 'success',
      results: products.length,
      totalResults,
      data: {
        products,
      },
    });
  }
);
