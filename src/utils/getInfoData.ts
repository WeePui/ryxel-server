import _ from 'lodash';

interface GetInfoDataParams {
  fields: string[];
  object: Record<string, any>;
}

export const getInfoData = ({
  fields = [],
  object = {},
}: GetInfoDataParams): Record<string, any> => {
  const data = _.pick(object, fields);
  return data;
};
