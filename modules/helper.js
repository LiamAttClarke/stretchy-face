exports.clamp = function(value, min, max) {
	if(value < min) {
		return min;
	} else if (value > max){
		return max;
	} else {
		return value;
	}
};

exports.lerp = function(value1, value2, t) {
	return value1 + (value2 - value1) * t;
};

exports.smootherstep = function(value1, value2, alpha) {
	var x = exports.clamp( (alpha - value1) / (value2 - value1), 0, 1 );
	return x * x * x * (x * (x * 6 - 15) + 10);
};