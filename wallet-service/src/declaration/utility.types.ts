// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
export type Utility = object | Function | string | string[] | any | (() => {});
export type UtilityObject = Record<string, Utility>;
export type UtilityFunction = (...args: Utility[]) => Utility;
export type UtilityList = Utility[];
export type UtilityError = Utility;
export type UtilityServiceRequest = Utility;
export type UtilityServiceResponse = Utility;
