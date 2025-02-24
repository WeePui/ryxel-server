import axios from 'axios';

export const calculateShippingFee = async (
  fromDistrict: number,
  toDistrict: number,
  to_ward_code: string,
  weight: number
): Promise<number> => {
  const shop_id = 5504852;
  try {
    const serviceResponse = await axios.post(
      'https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/available-services',
      {
        from_district: fromDistrict,
        to_district: toDistrict,
        shop_id: shop_id,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          token: process.env.GHN_API_KEY as string, // Replace YOUR_API_KEY with your actual API key
        },
      }
    );
    const serviceID = serviceResponse.data.data[0].service_id;
    const feeResponse = await axios.post(
      'https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/fee',
      {
        service_id: serviceID,
        to_district_id: toDistrict,
        to_ward_code: to_ward_code,
        weight: weight,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          token: '34fd4272-b38e-11ef-bfcf-9e83397c467a', // Replace YOUR_API_KEY with your actual API key
        },
      }
    );
    return feeResponse.data.data.service_fee;
  } catch (error) {
    console.error('Error calculating shipping fee:', error);
    throw error;
  }
};
