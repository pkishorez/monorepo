import { AttrResult } from './types.js';

const emptyAttrResult: AttrResult = {
  attrName: {},
  attrValue: {},
};
export const mergeAttrResults = (attrResults: AttrResult[]) =>
  attrResults.reduce(
    (acc, v) => ({
      attrName: { ...acc.attrName, ...v.attrName },
      attrValue: { ...acc.attrValue, ...v.attrValue },
    }),
    emptyAttrResult,
  );
