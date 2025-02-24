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

export const deleteImage = async (publicId: string): Promise<DeleteResult> => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error: any) {
    throw new Error(error.message);
  }
};
