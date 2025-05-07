import axios from 'axios';

export const nsfwDetection = (reviewId: string, images: string[]) => {
  const payload = { reviewId, images };
  axios
    .post(`${process.env.PYTHON_HOST}/api/detect`, payload, {
      headers: { 'Content-Type': 'application/json' },
    })
    .catch((error) => {
      console.error('Error in NSFW Detection API:', error.message);
    });
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
