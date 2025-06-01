import { Request, Response, NextFunction } from "express";
import Product, { updateProductPricing } from "../models/productModel";
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

export const aliasTopProducts = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  req.query.limit = "5";
  req.query.sort = "-sold";
  next();
};

export const getAllProducts = catchAsync(async (req, res) => {
  let apiFeatures = new APIFeatures(Product.find(), req.query);
  apiFeatures = await apiFeatures.search();

  const totalProducts = await apiFeatures.count();
  const resultsPerPage = Number(req.query.limit) || 10;

  apiFeatures.filter().sort().limitFields().paginate();

  const products = await apiFeatures.query.exec();
  const results = await apiFeatures.count();

  res.status(200).json({
    status: "success",
    data: {
      results,
      totalProducts,
      resultsPerPage,
      products,
    },
  });
});

export const getFilterData = catchAsync(async (req, res) => {
  let apiFeatures = new APIFeatures(Product.find(), req.query);
  apiFeatures = await apiFeatures.search();
  apiFeatures.filter();

  const allFilteredProducts = await apiFeatures.query
    .select("brand lowestPrice variants.specifications")
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

  const prices = allFilteredProducts.map((p) =>
    "lowestPrice" in p ? p.lowestPrice : 0
  ) as number[];

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

  updateProductPricing(product);
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

      // Validate sale offer if present
      if (variant.saleOff) {
        const validation = validateSaleOffer(variant.saleOff);
        if (!validation.isValid) {
          throw new AppError(
            `Invalid sale offer for variant ${index + 1}: ${validation.error}`,
            400
          );
        }
      }

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
  updateProductPricing(product);
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

    const updatedVariants = await Promise.all(
      parsedVariants.map(async (variant: any, index: number) => {
        const existingVariant = product.variants[index];
        if (!existingVariant) return variant;

        if (files?.length) {
          const variantImages = files.filter((file) =>
            file.fieldname.startsWith(`variantImages[${index}]`)
          );

          if (variantImages.length > 0) {
            for (const oldImageUrl of existingVariant.images) {
              const oldPublicId = extractPublicId(oldImageUrl);
              if (oldPublicId) await deleteImage(oldPublicId);
            }

            const uploadedImages = await Promise.all(
              variantImages.map((image) =>
                uploadImage("products/variants", image.buffer)
              )
            );
            variant.images = uploadedImages.map((img) => img.secure_url);
          }
        }
        if (variant.saleOff) {
          // Validate sale offer using utility function
          const validation = validateSaleOffer(variant.saleOff);
          if (!validation.isValid) {
            return next(new AppError(validation.error!, 400));
          }

          // Calculate final price using utility function
          variant.finalPrice = calculateFinalPrice(
            variant.price,
            variant.saleOff
          );
        } else {
          variant.finalPrice = variant.price;
        }

        return {
          ...existingVariant.toObject(),
          ...variant,
        };
      })
    );

    updateData.variants = updatedVariants;

    // Tính toán giá thấp nhất và phần trăm giảm giá
    const { lowestPrice, percentageSaleOff } = parsedVariants.reduce(
      (acc, variant) => {
        const finalPrice = variant.finalPrice || 1;
        if (finalPrice < acc.lowestPrice && finalPrice != variant.price) {
          return {
            lowestPrice: finalPrice,
            percentageSaleOff: variant.saleOff?.percentage || 0,
          };
        } else
          return {
            lowestPrice: variant.finalPrice,
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

  if (product.imageCover) {
    const coverImagePublicId = extractPublicId(product.imageCover);
    if (coverImagePublicId) await deleteImage(coverImagePublicId);
  }

  for (const variant of product.variants) {
    for (const imageUrl of variant.images) {
      const publicId = extractPublicId(imageUrl);
      if (publicId) await deleteImage(publicId);
    }
  }

  await Product.findByIdAndDelete(id);

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
  const products = await Product.find({ _id: { $in: productIDs } }).lean();

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
  const products = await Product.find({ _id: { $in: productIDs } }).lean();

  res.status(200).json({
    status: "success",
    results: products.length,
    totalResults: productIDs.length,
    data: { products },
  });
});
