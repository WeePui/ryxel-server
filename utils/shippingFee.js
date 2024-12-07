const axios = require('axios');

exports.calculateShippingFee = async (
  fromDistrict,
  toDistrict,
  to_ward_code,
  weight
) => {
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
          token: process.env.GHN_API_KEY, // Thay YOUR_API_KEY bằng API Key của bạn
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
          token: '34fd4272-b38e-11ef-bfcf-9e83397c467a', // Thay YOUR_API_KEY bằng API Key của bạn
        },
      }
    );
    return feeResponse.data.data.service_fee;
  } catch (error) {
    console.error('Error calculating shipping fee:', error);
    throw error;
  }
};
