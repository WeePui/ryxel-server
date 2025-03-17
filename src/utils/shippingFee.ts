import axios from 'axios';

export const calculateShippingFee = async (
  toDistrictCode: number,
  toWardCode: string,
  weight: number,
  fromDistrict = 3695
): Promise<number> => {
  try {
    const serviceResponse = await axios.post(
      'https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/available-services',
      {
        from_district: fromDistrict,
        to_district: toDistrictCode,
        shop_id: Number(process.env.GHN_SHOP_ID),
      },
      {
        headers: {
          'Content-Type': 'application/json',
          token: process.env.GHN_API_KEY as string,
        },
      }
    );

    const { data: serviceData } = serviceResponse.data;
    const { service_id: serviceId } = serviceData[0];

    const feeResponse = await axios.post(
      'https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/fee',
      {
        service_id: serviceId,
        to_district_id: toDistrictCode,
        to_ward_code: toWardCode,
        weight: weight,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          token: process.env.GHN_API_KEY,
        },
      }
    );

    const { data: feeData } = feeResponse.data;
    const { service_fee: serviceFee } = feeData;

    return serviceFee;
  } catch (error) {
    console.error('Error calculating shipping fee:', error);

    return -1;
  }
};
