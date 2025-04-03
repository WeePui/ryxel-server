import axios from 'axios';
import { token } from 'morgan';

export const getService = async (
  toDistrictCode: number,
  fromDistrict = 3695
) => {
  try {
    const response = await axios.post(
      'https://dev-online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/available-services',
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

    const { data } = response.data;
    return data[0];
  } catch (error) {
    console.error('Error getting GHN services:', error);

    return null;
  }
};

export const calculateShippingFee = async (
  serviceId: number,
  toDistrictCode: number,
  toWardCode: string,
  weight: number,
  fromDistrict = 3695,
  fromWard = '90737'
): Promise<number> => {
  try {
    const response = await axios.post(
      'https://dev-online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/fee',
      {
        shop_id: Number(process.env.GHN_SHOP_ID),
        from_district_id: fromDistrict,
        from_ward_code: fromWard,
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

    const { data: feeData } = response.data;
    const { total: total } = feeData;

    return Math.floor(total);
  } catch (error) {
    console.error('Error calculating shipping fee:', error);

    return -1;
  }
};

export const getExpectedDeliveryDate = async (
  serviceId: number,
  toDistrictCode: number,
  toWardCode: string,
  fromDistrictCode = 3695
) => {
  try {
    const response = await axios.post(
      'https://dev-online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/leadtime',
      {
        ShopID: Number(process.env.GHN_SHOP_ID),
        from_district_id: fromDistrictCode,
        to_district_id: toDistrictCode,
        to_ward_code: toWardCode,
        service_id: serviceId,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          token: process.env.GHN_API_KEY as string,
        },
      }
    );

    const { data } = response.data;
    const expectedDeliveryDate = new Date(data.leadtime * 1000);

    return expectedDeliveryDate;
  } catch (error) {
    console.error('Error getting expected delivery date:', error);
    return null;
  }
};
