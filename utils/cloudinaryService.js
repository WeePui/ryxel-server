const cloudinary = require('../configs/cloudinaryConfig');

exports.uploadImage = async (imageFile) => {
  try {
    const result = await cloudinary.v2.uploader.upload(imageFile, {
      folder: 'avatars',
      width: 150,
      crop: 'scale',
    });
    return result;
  } catch (error) {
    throw new Error(error.message);
  }
};

exports.deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.v2.uploader.destroy(publicId);
    return result;
  } catch (error) {
    throw new Error(error.message);
  }
};
