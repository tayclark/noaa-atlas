// Unit conversions for the NWS observation and forecast grid values, keyed by their WMO unit code.

/** Miles per hour in one of each wind speed unit NWS reports. */
export const MPH_PER_UNIT: Readonly<Record<string, number>> = {
  'wmoUnit:km_h-1': 0.621371,
  'wmoUnit:m_s-1': 2.23694,
  'wmoUnit:kn': 1.15078,
}
