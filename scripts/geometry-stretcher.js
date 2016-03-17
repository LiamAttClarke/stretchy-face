var THREE = require('three');

function updateGeometry ( object ) {
	object.geometry.verticesNeedUpdate = true;
	object.geometry.normalsNeedUpdate = true;
	object.geometry.computeFaceNormals();
	object.geometry.computeVertexNormals();
}

function elasticMeshProperties(elasticity, friction, stretchRangeFactor, stretchFactor, maxStretchDist) {
    return {
        elasticity: elasticity,
        friction: friction,
        stretchRangeFactor: stretchRangeFactor,
        maxStretchDist: maxStretchDist,
        stretchFactor: stretchFactor
    };
}

exports.elasticMeshProperties = elasticMeshProperties;

exports.elasticMesh = function (geometry, material, materialProperties) {
    var properties = elasticMeshProperties(
        materialProperties.elasticity || 0,
        materialProperties.friction || 0,
        materialProperties.stretchRangeFactor || 0,
        materialProperties.stretchFactor || 0,
        materialProperties.maxStretchDist || 0
    );
	var mesh = new THREE.Mesh(geometry, material);
	mesh.userData = {
		meshProperties: properties,
		originalVertices: [],
		tensionForces: []
	};
	for (var i = 0; i < geometry.vertices.length; i++) {
		mesh.userData.originalVertices.push( new THREE.Vector3().copy( geometry.vertices[i] ) );
		mesh.userData.tensionForces.push( new THREE.Vector3() );
	}
	return mesh;
};

exports.stretch = function (obj, hitPoint, deltaMousePos, stretchDistanceFactor) {
	var localHit = obj.worldToLocal( new THREE.Vector3().copy( hitPoint ) );
	for (var i = 0; i < obj.geometry.vertices.length; i++) {
		var originalVert = new THREE.Vector3().copy( obj.userData.originalVertices[i] );
		var vertToPinchDist = localHit.distanceToSquared( originalVert ) * obj.userData.meshProperties.stretchRangeFactor;
		var stretchFactor = 1 / (Math.pow(10, vertToPinchDist));
		var rotatedDeltaMousePos = new THREE.Vector3(deltaMousePos.x, deltaMousePos.y, 0);
		rotatedDeltaMousePos
            .applyQuaternion( new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -obj.rotation.y) )
            .negate();
		obj.geometry.vertices[i].add(new THREE.Vector3()
			.copy( rotatedDeltaMousePos )
			.multiplyScalar( stretchFactor * obj.userData.meshProperties.stretchFactor * stretchDistanceFactor)
        );
	}
	updateGeometry( obj );
    return obj;
};

exports.normalize = function (obj) {
	for (var i = 0; i < obj.geometry.vertices.length; i++) {
		var originalPos = new THREE.Vector3().copy( obj.userData.originalVertices[i] );
		var currentPos = new THREE.Vector3().copy( obj.geometry.vertices[i] );
		var deltaVect = currentPos.sub( originalPos );
		var distToOrigin = deltaVect.length();
		var elasticPotential = obj.userData.meshProperties.elasticity * distToOrigin * distToOrigin;
		obj.userData.tensionForces[i]
			.multiplyScalar( 1 - obj.userData.meshProperties.friction )
			.add( deltaVect.normalize().multiplyScalar( -elasticPotential ) );
		obj.geometry.vertices[i].add( obj.userData.tensionForces[i] );
	}
	updateGeometry( obj );
    return obj;
};