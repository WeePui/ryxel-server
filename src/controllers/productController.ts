import { Request, Response, NextFunction } from "express";
import Product from "../models/productModel";
import APIFeatures from "../utils/apiFeatures";
import catchAsync from "../utils/catchAsync";
import AppError from "../utils/AppError";
import { cartProductRecommend, similarProduct } from "../utils/python";
import {
  uploadImage,
  deleteImage,
  extractPublicId,
} from "../utils/cloudinaryService";
import {
  validateSaleOffer,
  calculateFinalPrice,
} from "../utils/saleValidation";
import User from "../models/userModel";

export const aliasTopProducts = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  req.query.limit = "5";
  req.query.sort = "-sold";
  next();
};

export const getAllProducts = catchAsync(
  async (req: Request, res: Response) => {
    let apiFeatures: APIFeatures;
    const user = await User.findById(req.user.id);
    if (!user || user.role !== "admin") {
      apiFeatures = new APIFeatures(
        Product.find({ isDeleted: false }),
        req.query
      );
    } else {
      apiFeatures = new APIFeatures(Product.find(), req.query);
    }
    apiFeatures = await apiFeatures.search();

    // Apply filters and sorting first
    apiFeatures.filter().sort().limitFields();

    // Get total count AFTER applying filters but BEFORE pagination
    const totalProducts = await apiFeatures.count();

    const resultsPerPage =
      Number(req.query.limit) ||
      Number(process.env.DEFAULT_LIMIT_PER_PAGE) ||
      10;

    let products;
    let results;
    if (apiFeatures.needsPriceAggregation) {
      // For aggregation queries, pagination is handled inside the pipeline
      products = await apiFeatures.executePriceSortedQuery();
      results = products.length;
    } else {
      // Apply pagination for regular queries
      apiFeatures.paginate();
      products = await apiFeatures.query.exec();
      results = products.length;
    }

    res.status(200).json({
      status: "success",
      data: {
        results,
        totalProducts,
        resultsPerPage,
        products,
      },
    });
  }
);

export const getFilterData = catchAsync(async (req, res) => {
  let apiFeatures: APIFeatures;
  const user = await User.findById(req.user.id);
  if (!user || user.role !== "admin") {
    apiFeatures = new APIFeatures(
      Product.find({ isDeleted: false }),
      req.query
    );
  } else {
    apiFeatures = new APIFeatures(Product.find(), req.query);
  }
  apiFeatures = await apiFeatures.search();
  apiFeatures.filter();

  const allFilteredProducts = await apiFeatures.query
    .select("brand variants.price variants.specifications")
    .lean()
    .exec();

  if (allFilteredProducts.length === 0) {
    return res.status(200).json({
      status: "success",
      data: { brands: [], minPrice: 0, maxPrice: 0, specs: {} },
    });
  }

  const brandCounts = allFilteredProducts.reduce(
    (acc, product) => {
      if (!("brand" in product)) return acc;
      acc[product.brand as string] = (acc[product.brand as string] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const brands = Object.entries(brandCounts).map(([value, count]) => ({
    value,
    count,
  }));
  const prices = allFilteredProducts.flatMap(
    (p: any) => p.variants?.map((v: any) => v.price ?? 0) ?? []
  );

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  const specsWithCounts = allFilteredProducts.reduce(
    (acc, product) => {
      const productSpecs = new Map<string, Set<string>>();
      if (!("variants" in product) || !product.variants) return acc;

      (product.variants as Array<any>).forEach((variant) => {
        const specs = variant.specifications || {};
        for (const [key, value] of Object.entries(specs)) {
          if (key === "weight" || !value) continue;
          if (!productSpecs.has(key)) productSpecs.set(key, new Set());
          productSpecs.get(key)?.add(value as string);
        }
      });

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
    status: "success",
    data: { brands, minPrice, maxPrice, specs },
  });
});

export const getProductBySlug = catchAsync(async (req, res, next) => {
  const product = await Product.findOne({ slug: req.params.slug }).populate({
    path: "reviews",
    match: { status: "approved" },
  });

  if (!product) {
    return next(new AppError("No product found with that slug", 404));
  }

  await Product.updateOne(
    { _id: product._id },
    {
      lowestPrice: product.lowestPrice,
      percentageSaleOff: product.percentageSaleOff,
      sold: product.sold,
    }
  );

  res.status(200).json({
    status: "success",
    data: { product },
  });
});

export const createProduct = catchAsync(async (req, res, next) => {
  const {
    name,
    brand,
    category,
    description,
    variants: variantsString,
  } = req.body;

  if (
    !name ||
    !brand ||
    !category ||
    !description ||
    !variantsString ||
    !req.files
  ) {
    return next(new AppError("Missing required fields", 400));
  }

  let variants;
  try {
    variants = JSON.parse(variantsString);
  } catch {
    return next(new AppError("Invalid variants format", 400));
  }

  if (!Array.isArray(variants) || variants.length === 0) {
    return next(new AppError("At least one variant is required", 400));
  }

  const files = req.files as Express.Multer.File[];
  const imageCover = files.find((file) => file.fieldname === "imageCover");

  if (!imageCover) {
    return next(new AppError("Product cover image is required", 400));
  }

  const coverImageResult = await uploadImage("products", imageCover.buffer);
  if (!coverImageResult) {
    return next(new AppError("Error uploading cover image", 500));
  }

  const processedVariants = await Promise.all(
    variants.map(async (variant, index) => {
      const variantImages = files.filter((file) =>
        file.fieldname.startsWith(`variantImages_${index}_`)
      );

      if (!variantImages.length) {
        throw new AppError(`Images are required for variant ${index + 1}`, 400);
      }

      const uploadedImages = await Promise.all(
        variantImages.map((image) =>
          uploadImage("products/variants", image.buffer)
        )
      );
      const imageUrls = uploadedImages.map((img) => img.secure_url);
      console.log(variant.saleOff);

      return {
        ...variant,
        images: imageUrls,
        sold: 0,
        finalPrice: calculateFinalPrice(variant.price, variant.saleOff),
      };
    })
  );

  const product = await Product.create({
    name,
    brand,
    category,
    description,
    imageCover: coverImageResult.secure_url,
    variants: processedVariants,
  });

  res.status(201).json({
    status: "success",
    data: { product },
  });
});

export const getProductById = catchAsync(async (req, res, next) => {
  const product = await Product.findById(req.params.id).populate("reviews");
  if (!product) {
    return next(new AppError("No product found with that ID", 404));
  }

  res.status(200).json({
    status: "success",
    data: { product },
  });
});

export const updateProduct = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const updateData = { ...req.body };
  const files = req.files as Express.Multer.File[] | undefined;

  const product = await Product.findById(id);
  if (!product) {
    return next(new AppError("No product found with that ID", 404));
  }

  if (files?.length) {
    const imageCover = files.find((file) => file.fieldname === "imageCover");
    if (imageCover) {
      if (product.imageCover) {
        const oldPublicId = extractPublicId(product.imageCover);
        if (oldPublicId) await deleteImage(oldPublicId);
      }
      const coverImageResult = await uploadImage("products", imageCover.buffer);
      if (!coverImageResult) throw new Error("Error uploading cover image");
      updateData.imageCover = coverImageResult.secure_url;
    }
  }
  if (updateData.variants) {
    let parsedVariants: any[] = [];

    if (typeof updateData.variants === "string") {
      try {
        parsedVariants = JSON.parse(updateData.variants);
      } catch {
        throw new Error("Invalid variants JSON string");
      }
    } else if (Array.isArray(updateData.variants)) {
      parsedVariants = updateData.variants;
    }
    const validVariants = parsedVariants.filter(
      (variant) => variant && typeof variant === "object"
    );

    const updatedVariants = await Promise.all(
      validVariants.map(async (variant: any, index: number) => {
        // Find existing variant by _id if it exists, otherwise create new one
        const existingVariant = variant._id
          ? product.variants.find(
              (v) => v._id && v._id.toString() === variant._id.toString()
            )
          : null;

        if (files?.length) {
          const variantImages = files.filter((file) =>
            file.fieldname.startsWith(`variantImages[${index}]`)
          );

          if (variantImages.length > 0) {
            // Only delete old images if we have an existing variant
            if (existingVariant && existingVariant.images) {
              for (const oldImageUrl of existingVariant.images) {
                const oldPublicId = extractPublicId(oldImageUrl);
                if (oldPublicId) await deleteImage(oldPublicId);
              }
            }

            const uploadedImages = await Promise.all(
              variantImages.map((image) =>
                uploadImage("products/variants", image.buffer)
              )
            );
            variant.images = uploadedImages.map((img) => img.secure_url);
          }
        }
        // Handle sale offer validation and final price calculation
        if (variant.saleOff) {
          // Check if this is an empty/inactive sale offer
          const hasEmptyStartDate =
            !variant.saleOff.startDate ||
            (typeof variant.saleOff.startDate === "string" &&
              variant.saleOff.startDate === "") ||
            (variant.saleOff.startDate instanceof Date &&
              isNaN(variant.saleOff.startDate.getTime()));

          const hasEmptyEndDate =
            !variant.saleOff.endDate ||
            (typeof variant.saleOff.endDate === "string" &&
              variant.saleOff.endDate === "") ||
            (variant.saleOff.endDate instanceof Date &&
              isNaN(variant.saleOff.endDate.getTime()));

          const hasZeroPercentage =
            !variant.saleOff.percentage || variant.saleOff.percentage === 0;

          if (hasEmptyStartDate && hasEmptyEndDate && hasZeroPercentage) {
            // Empty sale offer - remove it and set final price to regular price
            variant.saleOff = undefined;
            variant.finalPrice = variant.price;
          } else {
            // Validate sale offer using utility function
            const validation = validateSaleOffer(variant.saleOff);
            if (!validation.isValid) {
              throw new AppError(validation.error!, 400);
            }

            // Calculate final price using utility function
            variant.finalPrice = calculateFinalPrice(
              variant.price,
              variant.saleOff
            );
          }
        } else {
          variant.finalPrice = variant.price;
        }

        // If we have an existing variant, merge with new data
        if (existingVariant) {
          const mergedVariant = {
            ...existingVariant.toObject(),
            ...variant,
            _id: existingVariant._id, // Preserve the original _id
            updatedAt: new Date(), // Explicitly set updatedAt
          };
          // Remove any undefined fields that might cause issues
          Object.keys(mergedVariant).forEach((key) => {
            if (mergedVariant[key] === undefined) {
              delete mergedVariant[key];
            }
          });
          return mergedVariant;
        } else {
          // New variant - ensure it has all required fields
          const newVariant = {
            ...variant,
            sold: variant.sold || 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          // Remove any undefined fields that might cause issues
          Object.keys(newVariant).forEach((key) => {
            if (newVariant[key] === undefined) {
              delete newVariant[key];
            }
          });
          return newVariant;
        }
      })
    );
    updateData.variants = updatedVariants;

    // Tính toán giá thấp nhất và phần trăm giảm giá
    const { lowestPrice, percentageSaleOff } = validVariants.reduce(
      (acc, variant) => {
        const finalPrice = variant.finalPrice || variant.price || 1;
        if (finalPrice < acc.lowestPrice && finalPrice != variant.price) {
          return {
            lowestPrice: finalPrice,
            percentageSaleOff: variant.saleOff?.percentage || 0,
          };
        } else
          return {
            lowestPrice: finalPrice,
            percentageSaleOff: 0,
          };
      },
      { lowestPrice: Infinity, percentageSaleOff: 0 }
    );

    updateData.lowestPrice = lowestPrice;
    updateData.percentageSaleOff = percentageSaleOff;
  }

  const updatedProduct = await Product.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    status: "success",
    data: { product: updatedProduct },
  });
});

export const deleteProduct = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const product = await Product.findById(id);
  if (!product) {
    return next(new AppError("No product found with that ID", 404));
  }
  if (product.isDeleted) {
    return next(new AppError("Product has already been deleted", 400));
  }

  await Product.findByIdAndUpdate(id, { isDeleted: true });

  res.status(204).json({
    status: "success",
    data: null,
  });
});

export const getSimilarProduct = catchAsync(async (req, res) => {
  const { productId } = req.params;
  if (!productId) {
    return res.status(400).json({
      status: "error",
      message: "Missing productID in params.",
    });
  }

  const recommendedProducts = await similarProduct(productId);
  if (!recommendedProducts) {
    return res.status(404).json({
      status: "Fatal error",
      message:
        "No recommended products found. If this is a new product, please retrain the model",
    });
  }

  const productIDs = recommendedProducts.map((rec: any) => rec.productID);
  const products = await Product.find({ _id: { $in: productIDs } });

  res.status(200).json({
    status: "success",
    results: products.length,
    totalResults: productIDs.length,
    data: { products },
  });
});

export const getCartProductRecommend = catchAsync(async (req, res) => {
  const { productId } = req.params;

  if (!productId) {
    return res.status(400).json({
      status: "error",
      message: "Missing productID in params.",
    });
  }

  const recommendedProducts = await cartProductRecommend(productId);
  if (!recommendedProducts) {
    return res.status(404).json({
      status: "Fatal error",
      message:
        "No recommended products found. If this is a new product, please retrain the model",
    });
  }

  const productIDs = recommendedProducts.map((rec: any) => rec.productID);
  const products = await Product.find({ _id: { $in: productIDs } });

  res.status(200).json({
    status: "success",
    results: products.length,
    totalResults: productIDs.length,
    data: { products },
  });
});
