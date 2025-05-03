import axios from 'axios';

export const nsfwDetection = async (
  reviewId: string,
  images: string[]
): Promise<any> => {
  const payload = {
    reviewId,
    images, // A list of Cloudinary image links
  };
  try {
    axios.post(`${process.env.PYTHON_HOST}/detect`, payload, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error: any) {
    console.error('Error in NSFW Detection API:', error.message);
    throw new Error(
      error.response?.data?.message || 'Failed to call NSFW Detection API'
    );
  }
};

// Hàm gọi đến API /recommend
export const cartProductRecommend = async (productID: string): Promise<any> => {
  try {
    const response = await axios.get(
      `${process.env.PYTHON_HOST}/api/recommend?product_id=${productID}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.recommendations;
  } catch (error: any) {
    console.error('Error in Recommend Product API:', error.message);
    throw new Error(
      error.response?.data?.message || 'Failed to call Recommend Product API'
    );
  }
};

export const similarProduct = async (productID: string): Promise<any> => {
  try {
    const response = await axios.get(
      `${process.env.PYTHON_HOST}/api/similar?product_id=${productID}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.similars;
  } catch (error: any) {
    console.error('Error in Recommend Product API:', error.message);
    throw new Error(
      error.response?.data?.message || 'Failed to call Recommend Product API'
    );
  }
};
