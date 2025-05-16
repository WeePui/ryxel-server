import axios from 'axios';

interface GHNPickServiceType {
  weight: number; // in grams
  length: number; // in cm
  width: number; // in cm
  height: number; // in cm
}

function calculateShippingWeight({
  weight,
  length,
  width,
  height,
}: GHNPickServiceType) {
  console.log('Weight:', weight);
  console.log('Dimensions:', length, width, height);

  const volumetricWeight = (length * width * height) / 5;
  const actualWeight = weight;

  return Math.max(volumetricWeight, actualWeight);
}

export const ghnStatusDescriptions: Record<string, string> = {
  ready_to_pick: 'Đã tạo đơn vận chuyển',
  picked: 'Đơn vị vận chuyển đã lấy hàng',
  storing: 'Hàng đang nằm ở kho',
  transporting: 'Đang luân chuyển hàng',
  sorting: 'Đang phân loại hàng hóa',
  delivering: 'Đơn vị vận chuyển đang giao cho người nhận',
  delivered: 'Giao hàng thành công',
  delivery_fail: 'Giao hàng thất bại',
  return: 'Trả hàng',
  returned: 'Trả hàng thành công',
  lost: 'Hàng bị mất',
  damage: 'Hàng bị hư hỏng',
  exception: 'Đơn hàng ngoại lệ',
};

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
    return data;
  } catch (error) {
    console.error('Error getting GHN services:', error);

    return null;
  }
};

export const calculateShippingFee = async (
  toDistrictCode: number,
  toWardCode: string,
  totalWeight: number,
  lineItems: {
    name: string;
    quantity: number;
    code: string;
    price: number;
    weight: number;
    length: number;
    width: number;
    height: number;
    category: { level1: string; level2?: string; level3?: string };
  }[],
  fromDistrict = 3695,
  fromWard = '90737'
): Promise<{ shippingFee: number; serviceId: number | null }> => {
  try {
    const service = await getService(toDistrictCode, fromDistrict);

    if (!service) {
      throw new Error('No available service found');
    }

    let serviceId = null;
    const shippingWeight = lineItems.reduce((acc, item) => {
      const weight = calculateShippingWeight(item);
      return acc + weight;
    }, 0);
    if (shippingWeight < 20000) {
      serviceId = service.find((s: any) => s.service_type_id === 2)?.service_id;
    } else {
      serviceId = service.find((s: any) => s.service_type_id === 5)?.service_id;
    }

    if (!serviceId) {
      throw new Error('No available service ID found');
    }

    const response = await axios.post(
      'https://dev-online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/fee',
      {
        shop_id: Number(process.env.GHN_SHOP_ID),
        from_district_id: fromDistrict,
        from_ward_code: fromWard,
        service_id: serviceId,
        to_district_id: toDistrictCode,
        to_ward_code: toWardCode,
        weight: totalWeight,
        items: lineItems,
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

    return { shippingFee: Math.floor(total), serviceId };
  } catch (error) {
    console.error('Error calculating shipping fee:', error);

    return { shippingFee: -1, serviceId: null };
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

interface ShippingOrderParams {
  toName: string;
  toPhone: string;
  toAddress: string;
  toWardName: string;
  toDistrictName: string;
  toDistrictCode: number;
  toProvinceName: string;
  clientOrderCode: string;
  weight: number;
  lineItems: {
    name: string;
    quantity: number;
    code: string;
    price: number;
    weight: number;
    length: number;
    width: number;
    height: number;
    category: { level1: string; level2?: string; level3?: string };
  }[];
}

export const createShippingOrder = async ({
  toName,
  toPhone,
  toAddress,
  toWardName,
  toDistrictName,
  toDistrictCode,
  toProvinceName,
  clientOrderCode,
  weight,
  lineItems,
}: ShippingOrderParams) => {
  try {
    const service = await getService(toDistrictCode);

    if (!service) {
      throw new Error('No available service found');
    }

    let serviceTypeId = null;
    const shippingWeight = lineItems.reduce((acc, item) => {
      const weight = calculateShippingWeight(item);
      return acc + weight;
    }, 0);
    if (shippingWeight < 20000) {
      serviceTypeId = service.find(
        (s: any) => s.service_type_id === 2
      )?.service_type_id;
    } else {
      serviceTypeId = service.find(
        (s: any) => s.service_type_id === 5
      )?.service_type_id;
    }

    if (!serviceTypeId) {
      throw new Error('No available service ID found');
    }

    const response = await axios.post(
      'https://dev-online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create',
      {
        shop_id: Number(process.env.GHN_SHOP_ID),
        to_name: toName,
        to_phone: toPhone,
        to_address: toAddress,
        to_ward_name: toWardName,
        to_district_name: toDistrictName,
        to_province_name: toProvinceName,
        client_order_code: clientOrderCode,
        service_type_id: serviceTypeId,
        payment_type_id: 1,
        required_note: 'CHOXEMHANGKHONGTHU',
        weight: weight,
        items: lineItems,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          token: process.env.GHN_API_KEY as string,
          ShopId: Number(process.env.GHN_SHOP_ID),
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error creating shipping order:', error);
    throw new Error('Failed to create shipping order');
  }
};
