import cloudinary from '../configs/cloudinaryConfig';

interface UploadResult {
  public_id: string;
  url: string;
  secure_url: string;
  [key: string]: any;
}

interface DeleteResult {
  result: string;
  [key: string]: any;
}

// utils/cloudinaryUtils.ts (sửa hàm uploadImage)

export const uploadImage = (
  folder: string,
  imageFile: Buffer | string,
  options: {
    width?: number;
    height?: number;
    crop?: string;
  } = {}
): Promise<UploadResult> => {
  // Nếu là Buffer → dùng upload_stream
  if (Buffer.isBuffer(imageFile)) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          ...options,
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result as UploadResult);
        }
      );
      stream.end(imageFile);
    });
  }

  // Nếu là string path → dùng upload()
  return cloudinary.uploader
    .upload(imageFile, {
      folder,
      ...options,
    })
    .then((result) => result as UploadResult);
};

export const extractPublicId = (secureUrl: string) => {
  const matches = secureUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(\.[a-z]+)?$/i);
  return matches ? matches[1] : null;
};

export const deleteImage = async (publicId: string): Promise<DeleteResult> => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error: any) {
    throw new Error(error.message);
  }
};

export const uploadProductReview = (
  buffer: Buffer,
  mimetype: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'product-reviews',
        resource_type: mimetype.startsWith('video') ? 'video' : 'image',
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result?.secure_url || '');
      }
    );

    stream.end(buffer); // Truyền buffer vào stream
  });
};
