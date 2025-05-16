import { Request, Response, NextFunction } from 'express';
import Product from '../models/productModel';
import APIFeatures from '../utils/apiFeatures';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/AppError';
import { cartProductRecommend, similarProduct } from '../utils/python';
import {
  deleteImage,
  extractPublicId,
  uploadImage,
} from '../utils/cloudinaryService';

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

    const resultsPerPage =
      Number(req.query.limit) || Number(process.env.DEFAULT_LIMIT_PER_PAGE);
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
      .populate({
        path: 'reviews',
        match: { status: 'approved' },
        options: { sort: { rating: -1, createdAt: -1 } },
      })
      .lean();

    if (!product) {
      return next(new AppError('No product found with that slug', 404));
    }

    (product as any).reviews = (product as any).reviews?.filter(
      (review: any) => review.user.active
    );

    res.status(200).json({
      status: 'success',
      data: {
        product,
      },
    });
  }
);

export const createProduct = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { name, brand, category, description, variants } = req.body;

    // Validate required fields
    if (
      !name ||
      !brand ||
      !category ||
      !description ||
      !variants ||
      !req.files
    ) {
      return next(new AppError('Missing required fields', 400));
    }

    // Validate variants array
    if (!Array.isArray(variants) || variants.length === 0) {
      return next(new AppError('At least one variant is required', 400));
    }

    // Process image files
    const files = req.files as Express.Multer.File[];
    const imageCover = files.find((file) => file.fieldname === 'imageCover');
    const variantImages = files.filter((file) =>
      file.fieldname.startsWith('variants[')
    );

    if (!imageCover) {
      return next(new AppError('Product cover image is required', 400));
    }

    // Upload cover image
    const [coverImageResult] = await Promise.all([
      uploadImage('products', imageCover.path),
    ]);

    if (!coverImageResult) {
      return next(new AppError('Error uploading cover image', 500));
    }

    // Process variants and their images
    const processedVariants = await Promise.all(
      variants.map(async (variant, index) => {
        const variantImages = files.filter((file) =>
          file.fieldname.startsWith(`variants[${index}][images]`)
        );

        if (!variantImages || variantImages.length === 0) {
          throw new AppError(
            `Images are required for variant ${index + 1}`,
            400
          );
        }

        // Upload variant images
        const uploadedImages = await Promise.all(
          variantImages.map((image) =>
            uploadImage('products/variants', image.path)
          )
        );

        const imageUrls = uploadedImages.map((img) => img.secure_url);

        return {
          ...variant,
          images: imageUrls,
          sold: 0,
          finalPrice: variant.saleOff
            ? variant.price * (1 - variant.saleOff.percentage / 100)
            : variant.price,
        };
      })
    );

    // Create product
    const product = await Product.create({
      name,
      brand,
      category,
      description,
      imageCover: coverImageResult.secure_url,
      variants: processedVariants,
    });

    res.status(201).json({
      status: 'success',
      data: {
        product,
      },
    });
  }
);

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
    const updateData = { ...req.body };
    const files = req.files as Express.Multer.File[] | undefined;

    // Find product first
    const product = await Product.findById(id);
    if (!product) {
      return next(new AppError('No product found with that ID', 404));
    }

    try {
      // Handle cover image update if provided
      if (files?.length) {
        const imageCover = files.find(
          (file) => file.fieldname === 'imageCover'
        );
        if (imageCover) {
          // Delete old cover image
          if (product.imageCover) {
            const oldPublicId = extractPublicId(product.imageCover);
            if (oldPublicId) {
              await deleteImage(oldPublicId);
            }
          }
          // Upload new cover image
          const coverImageResult = await uploadImage(
            'products',
            imageCover.path
          );
          if (!coverImageResult) {
            throw new Error('Error uploading cover image');
          }
          updateData.imageCover = coverImageResult.secure_url;
        }
      }

      // Handle variant updates
      if (updateData.variants) {
        const updatedVariants = await Promise.all(
          updateData.variants.map(async (variant: any, index: number) => {
            const existingVariant = product.variants[index];
            if (!existingVariant) return variant;

            // Handle variant images if provided
            if (files?.length) {
              const variantImages = files.filter((file) =>
                file.fieldname.startsWith(`variants[${index}][images]`)
              );

              if (variantImages.length > 0) {
                // Delete old variant images
                for (const oldImageUrl of existingVariant.images) {
                  const oldPublicId = extractPublicId(oldImageUrl);
                  if (oldPublicId) {
                    await deleteImage(oldPublicId);
                  }
                }

                // Upload new variant images
                const uploadedImages = await Promise.all(
                  variantImages.map((image) =>
                    uploadImage('products/variants', image.path)
                  )
                );
                variant.images = uploadedImages.map((img) => img.secure_url);
              }
            }

            // Handle sale off update if provided
            if (variant.saleOff) {
              // Validate sale off data
              if (
                !variant.saleOff.percentage ||
                !variant.saleOff.startDate ||
                !variant.saleOff.endDate
              ) {
                throw new Error('Missing required sale off fields');
              }

              // Validate percentage
              if (
                variant.saleOff.percentage < 0 ||
                variant.saleOff.percentage > 100
              ) {
                throw new Error(
                  'Sale off percentage must be between 0 and 100'
                );
              }

              // Validate dates
              const startDate = new Date(variant.saleOff.startDate);
              const endDate = new Date(variant.saleOff.endDate);
              const now = new Date();

              if (startDate < now) {
                throw new Error('Sale off start date must be in the future');
              }

              if (endDate <= startDate) {
                throw new Error('Sale off end date must be after start date');
              }
            }

            return {
              ...existingVariant.toObject(),
              ...variant,
            };
          })
        );
        updateData.variants = updatedVariants;
      }

      // Update product
      const updatedProduct = await Product.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      });

      res.status(200).json({
        status: 'success',
        data: {
          product: updatedProduct,
        },
      });
    } catch (error) {
      return next(
        new AppError(`Error updating product: ${(error as Error).message}`, 500)
      );
    }
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
