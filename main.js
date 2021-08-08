var THREE = require('three');
var geometryStretcher = require('./geometry-stretcher.js');

var renderTarget = document.getElementById('renderTarget');
var renderTargetRect, pointerStartPosition, raycastHitInfo, camera, directionalLight;
var scene = new THREE.Scene();
var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: 1 });
var	startRotation = -Math.PI / 8;
var	raycaster = new THREE.Raycaster();
var	lastPointerPos = new THREE.Vector2();
var	ELASTIC_OBJECT_STATES = {
    rest: 0,
    stretching: 1,
    rotating: 2
};
var elasticObjectState = 0;
var elasticObject = null;
var sceneColor = new THREE.Color(0x333333);
var ambientColor = new THREE.Color(0x888888);
var rotateSpeed = 0.01;
var maxStretchDistance = 512;
var elasticMeshProperties = {
    elasticity: 0.5,
    friction: 0.25,
    stretchRange: 2,
    stretchStrength: 0.003
};
var modelJSON = require('./assets/liam_model.json');
var texturePath = './assets/liam_texture.png';

function start () {
	// init renderer
    renderTargetRect = renderTarget.getBoundingClientRect();
	renderer.setSize(renderTarget.clientWidth, renderTarget.clientHeight);
	renderTarget.appendChild(renderer.domElement);
	renderer.setClearColor(sceneColor);
	// Init Camera
    camera = new THREE.PerspectiveCamera(30, renderTarget.clientWidth / renderTarget.clientHeight, 0.1, 100)
	camera.position.set(0, 0, 8);
    // init light
    var ambientLight = new THREE.AmbientLight(ambientColor);
    scene.add(ambientLight);
    directionalLight = new THREE.DirectionalLight( 0xffffff, 0.8 );
    directionalLight.position.set(-1, 1, 1);
    scene.add(directionalLight);
	// Init Elastic Object
    elasticObject = geometryStretcher.elasticMesh(
        (new THREE.JSONLoader()).parse(modelJSON).geometry,
        new THREE.MeshLambertMaterial(),
        elasticMeshProperties);
    elasticObject.material.map = new THREE.TextureLoader().load(texturePath);
    elasticObject.material.needsUpdate = true;
    elasticObject.rotation.y = startRotation;
    scene.add(elasticObject);
    // init events
    window.addEventListener('resize', onResizeEvent, false);
    onResizeEvent();
    // user input events
    renderTarget.addEventListener('mousedown', onPointerStart, false);
    renderTarget.addEventListener('touchstart', onPointerStart, false);
    window.addEventListener('mousemove', onPointerMove, false);
    window.addEventListener('touchmove', onPointerMove, false);
    window.addEventListener('mouseup', onPointerEnd, false);
    window.addEventListener('touchend', onPointerEnd, false);
    renderTarget.addEventListener('contextmenu', function(event) { event.preventDefault(); }, false);;
    // start render loop
    update();
}

function update() {
	// normalize elastic object
	if(elasticObjectState !== ELASTIC_OBJECT_STATES.stretching) {
		geometryStretcher.normalize(elasticObject);
	}
    // render
	renderer.render(scene, camera);
	// loop
	requestAnimationFrame(update);
}

function onPointerStart(event) {
    var pointerPos = GetPointerPosition(event);
	lastPointerPos = new THREE.Vector2().copy(pointerPos);
    pointerStartPosition = new THREE.Vector2().copy(pointerPos);
	raycaster.setFromCamera(normalizedPointerPosition(pointerPos), camera);
	var hits = raycaster.intersectObjects(scene.children, false);
    if (hits.length === 0) {
        elasticObjectState = ELASTIC_OBJECT_STATES.rotating;
    } else {
        for (var i = 0; i < hits.length; i++) {
            if(hits[i].object.userData.tag === geometryStretcher.elasticMeshTag) {
                raycastHitInfo = hits[i];
                elasticObjectState = ELASTIC_OBJECT_STATES.stretching;
                break;
            }
        }
    }
}

function onPointerMove(event) {
    if (elasticObjectState === ELASTIC_OBJECT_STATES.rest) return;
    event.preventDefault();
	var pointerPos = GetPointerPosition(event);
	var pointerDelta = new THREE.Vector2().copy( lastPointerPos ).sub( pointerPos );
    pointerDelta.y *= -1;
	lastPointerPos.copy( pointerPos );
	if(elasticObjectState === ELASTIC_OBJECT_STATES.stretching) {
        var distToPointer = new THREE.Vector2()
            .copy( pointerPos )
            .sub( pointerStartPosition )
            .length();
        if (distToPointer < maxStretchDistance) {
            var stretchDistance = 1.0 - distToPointer / maxStretchDistance;
    		geometryStretcher.stretch(elasticObject, raycastHitInfo.point, pointerDelta, stretchDistance);
        } else {
            elasticObjectState = ELASTIC_OBJECT_STATES.rest;
        }
	} else if(elasticObjectState === ELASTIC_OBJECT_STATES.rotating) {
		elasticObject.rotation.y -= pointerDelta.x * rotateSpeed;
		if (elasticObject.rotation.y < startRotation - Math.PI) {
			elasticObject.rotation.y += Math.PI * 2;
		} else if(elasticObject.rotation.y > startRotation + Math.PI) {
			elasticObject.rotation.y -= Math.PI * 2;
		}
	}
}

function onPointerEnd(event) {
	if (elasticObjectState === ELASTIC_OBJECT_STATES.rest) return;
    event.preventDefault();
    elasticObjectState = ELASTIC_OBJECT_STATES.rest;
}

function GetPointerPosition(event) {
    return event.touches ?
        new THREE.Vector2(event.touches[0].clientX, event.touches[0].clientY) :
        new THREE.Vector2(event.clientX, event.clientY);
}

function onResizeEvent() {
    var rtWidth = renderTarget.clientWidth;
	var rtHeight = renderTarget.clientHeight;
	renderTargetRect = renderTarget.getBoundingClientRect();
	camera.aspect = rtWidth / rtHeight;
	renderer.setSize(rtWidth, rtHeight);
	camera.updateProjectionMatrix();
}

function normalizedPointerPosition(pointerPosition) {
	return new THREE.Vector2(
		((pointerPosition.x - renderTargetRect.left) / renderTarget.clientWidth) * 2 - 1,
		-(((pointerPosition.y - renderTargetRect.top) / renderTarget.clientHeight) * 2 - 1)
	);
}

window.onload = start;