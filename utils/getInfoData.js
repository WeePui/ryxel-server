const _ = require('lodash');

exports.getInfoData = ({ fields = [], object = {} }) => {
  const data = _.pick(object, fields);
  return data;
};
