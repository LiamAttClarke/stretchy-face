exports.vertexShader = `
	varying vec2 vUv;
	varying vec3 vWorldSpaceNormal;
	void main() {
		vUv = uv;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		vWorldSpaceNormal = (modelMatrix * vec4(normal, 1.0)).xyz;
	}
`;

exports.fragmentShader = `
	uniform sampler2D texture;
	uniform vec3 uViewDir;
	uniform float uRimWidth;
	uniform float uRimIntensity;
	varying vec3 vWorldSpaceNormal;
	varying vec2 vUv;
	void main() {
		vec3 worldSpaceNormal = normalize( vWorldSpaceNormal );
		float rimLight = uRimIntensity * smoothstep(1.0 - uRimWidth, 1.0, 1.0 - max(dot(worldSpaceNormal, -uViewDir), 0.0));
		gl_FragColor = texture2D(texture, vUv) + rimLight;
	}
`;