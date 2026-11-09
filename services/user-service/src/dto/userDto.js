/**
 * DTOs of user-service: input and output objects of the controller and their mapping
 * from / to the messages of proto/user.proto. Messages arrive with camelCase fields;
 * an `optional` field that was not sent arrives as undefined.
 */

/** @returns {object} user DTO (shape of the User message) */
export function toUserDto(user) {
  const data = user.toJSON();
  return {
    id: data.id,
    version: data.version,
    updatedAt: data.updatedAt,
    role: data.role,
    name: data.name,
    phone: data.phone ?? '',
    location: data.location ? { lat: data.location.lat, lng: data.location.lng } : null,
    farm: data.farm,
    village: data.village,
    town: data.town,
    crops: data.crops ?? [],
    type: data.type,
    ratingCriteria: user.ratingCriteria(),
  };
}

export const toSessionDto = ({ token, user }) => ({ token, user: toUserDto(user) });

export function registerFromMessage(message) {
  const { role, name, email, password, phone, town, village, farm, type } = message;
  return { role, name, email, password, phone, town, village, farm, type };
}

export function loginFromMessage({ email, password, role }) {
  return { email, password, role };
}

export function nearbyFromMessage({ lat, lng, radiusKm }) {
  return { lat, lng, radiusKm };
}

export const toNearbyProducerDto = ({ producer, distanceKm }) => ({ producer: toUserDto(producer), distanceKm });
