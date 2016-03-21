var THREE = require('three');

function updateGeometry ( object ) {
	object.geometry.verticesNeedUpdate = true;
	object.geometry.normalsNeedUpdate = true;
	object.geometry.computeFaceNormals();
	object.geometry.computeVertexNormals();
}

exports.elasticMeshTag = 'elastic';

exports.elasticMesh = function (geometry, material, materialProperties) {
	var mesh = new THREE.Mesh(geometry.clone(), material);
	mesh.userData = {
        tag: exports.elasticMeshTag,
		materialProperties: materialProperties,
		originalGeometry: geometry,
		tensionForces: []
	};
	for (var i = 0; i < geometry.vertices.length; i++) {
		mesh.userData.tensionForces.push( new THREE.Vector3() );
	}
	return mesh;
};

exports.stretch = function (obj, hitPoint, deltaMousePos, stretchDistance) {
    var stretchRange = obj.userData.materialProperties.stretchRange || 0;
    var stretchStrength = obj.userData.materialProperties.stretchStrength || 0;
	var localHit = obj.worldToLocal( new THREE.Vector3().copy( hitPoint ) );
	for (var i = 0; i < obj.geometry.vertices.length; i++) {
		var originalVert = new THREE.Vector3().copy( obj.userData.originalGeometry.vertices[i] );
		var vertToPinchDist = localHit.distanceToSquared( originalVert ) * stretchRange;
		var stretchFactor = 1 / (Math.pow(10, vertToPinchDist));
		var rotatedDeltaMousePos = new THREE.Vector3(deltaMousePos.x, deltaMousePos.y, 0);
		rotatedDeltaMousePos
            .applyQuaternion( new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -obj.rotation.y) )
            .negate();
		obj.geometry.vertices[i].add(new THREE.Vector3()
			.copy( rotatedDeltaMousePos )
			.multiplyScalar( stretchFactor * stretchStrength * stretchDistance)
        );
	}
	updateGeometry( obj );
    return obj;
};

exports.normalize = function (obj) {
    var elasticity = obj.userData.materialProperties.elasticity || 0;
    var friction = obj.userData.materialProperties.friction || 0;
	for (var i = 0; i < obj.geometry.vertices.length; i++) {
		var originalPos = new THREE.Vector3().copy( obj.userData.originalGeometry.vertices[i] );
		var currentPos = new THREE.Vector3().copy( obj.geometry.vertices[i] );
		var deltaVect = currentPos.sub( originalPos );
		var distToOrigin = deltaVect.length();
		var elasticPotential = elasticity * distToOrigin * distToOrigin;
		obj.userData.tensionForces[i]
			.multiplyScalar( 1 - friction )
			.add( deltaVect.normalize().multiplyScalar( -elasticPotential ) );
		obj.geometry.vertices[i].add( obj.userData.tensionForces[i] );
	}
	updateGeometry( obj );
    return obj;
};