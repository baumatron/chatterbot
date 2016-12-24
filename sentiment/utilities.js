
module.exports.isArray = function isArray(value) {
    return value &&
        typeof value === 'object' &&
        typeof value.length === 'number' &&
        typeof value.splice === 'function' &&
        !(value.propertyIsEnumerable('length'));
}

module.exports.randomElement = function randomElement(array) {
    if (module.exports.isArray(array)) {
        // Math.random() provides a value [0, 1)
        index = Math.floor(Math.random() * array.length);
        return array[index];
    } else {
        throw { message: 'Unexpected argument type.' };
    }
}