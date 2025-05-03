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

export const uploadImage = async (imageFile: string): Promise<UploadResult> => {
  try {
    const result = await cloudinary.uploader.upload(imageFile, {
      folder: 'avatars',
      width: 150,
      height: 150,
      crop: 'fill',
    });
    return result;
  } catch (error: any) {
    throw new Error(error.message);
  }
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

export const uploadVideo = async (
  buffer: Buffer
): Promise<{ secure_url: string }> => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'video',
        folder: 'product-reviews',
        width: 640,
        height: 360,
        crop: 'fill',
        format: 'mp4',
      },
      (error, result) => {
        if (error) return reject(error);
        if (result && result.secure_url) {
          resolve({ secure_url: result.secure_url });
        } else {
          reject(new Error('Invalid upload response'));
        }
      }
    );
    stream.end(buffer);
  });
};

export const deleteVideo = async (publicId: string): Promise<DeleteResult> => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'video', // Specify the resource type as video
    });
    return result;
  } catch (error: any) {
    throw new Error(error.message);
  }
};
