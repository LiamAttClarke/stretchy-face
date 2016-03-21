var THREE = require('three');
var DAT = require('dat-gui');
var geometryStretcher = require('../../modules/geometry-stretcher.js');
// models
var liamModel = require('../models/head.json');
var teapotModel = require('../models/utah-teapot.json');
var suzanneModel = require('../models/suzanne.json');
// dom elements
var renderTarget = document.getElementById('render-target');
//
var renderTargetRect, pointerStartPosition, tanFOV, raycastHitInfo, camera, headTexture, viewDirection, directionalLight;
var scene = new THREE.Scene(),
	renderer = new THREE.WebGLRenderer( { antialias: true, alpha: 1 } ),
	startRotation = -Math.PI / 8, 
	raycaster = new THREE.Raycaster(), 
	lastPointerPos = new THREE.Vector2(),
	elasticObjectState = {
		rest: 0,
		stretching: 1,
		rotating: 2
    },
	currentElasticObjectState = 0;
// scene objects
var elasticObject;
// scene variables
var sceneColor = new THREE.Color(0xdddddd),
	ambientColor = new THREE.Color(0x888888),
	rotateSpeed = 0.01;
var defaultParams = {
    model: 'liam',
    material: 'basic',
    elasticity: 0.5,
    friction: 0.25,
};
var params = {
    model: defaultParams.model,
    material: defaultParams.material,
    elasticity: defaultParams.elasticity,
    friction: defaultParams.friction,
    stretchRange: 2,
    stretchStrength: 0.003,
    maxStretchDistance: 512,
    reset: function () {
        params.model = defaultParams.model;
        params.material = defaultParams.material;
        params.elasticity = defaultParams.elasticity;
        params.friction = defaultParams.friction;
        initElasticObject();
    }
};
var textureURLs = [
    './demo/textures/head.png'
];
var geometries, materials, textures;

// Initialization
function initializeResources() {
    // parse JSON models
    var jsonLoader = new THREE.JSONLoader();
    geometries = {
        liam: jsonLoader.parse(liamModel).geometry,
        teapot: jsonLoader.parse(teapotModel).geometry,
        suzanne: jsonLoader.parse(suzanneModel).geometry
    };
    // load textures
    var textureLoader = new THREE.TextureLoader();
    textureLoader.load(
        './demo/textures/head.png',
        function (texture) {
            headTexture = texture;                
            start();
        }
    );  
}
window.onload = initializeResources;

function start () {
    // Init GUI
    var modelOptions = {                
        Liam: 'liam',
        Teapot: 'teapot',
        Suzanne: 'suzanne'
    };
    var materialOptions = {
        Basic: 'basic',
        Lambert: 'lambert',
        Phong: 'phong',
        Normal: 'normal'
    };
    var gui = new DAT.GUI();
    gui.add(params, 'model').options(modelOptions).name('Model').listen().onChange(function () {
        initElasticObject();
    });
    gui.add(params, 'material').options(materialOptions).name('Material').listen().onChange(function () {
        elasticObject.material = materials[params.material];
        elasticObject.material.map = (params.model === 'liam') ? headTexture : null;
        elasticObject.material.needsUpdate = true;
    });
    gui.add(params, 'elasticity', 0.1, 1).name('Elasticity').listen();
    gui.add(params, 'friction', 0.1, 1).name('Friction').listen();
    gui.add(params, 'reset').name('Reset');
	// init renderer
    renderTargetRect = renderTarget.getBoundingClientRect();
	renderer.setSize(renderTarget.clientWidth, renderTarget.clientHeight);
	renderTarget.appendChild( renderer.domElement );
	renderer.setClearColor(sceneColor);
	// Init Camera
    camera = new THREE.PerspectiveCamera(45, renderTarget.clientWidth / renderTarget.clientHeight, 0.1, 100)
	camera.position.set(0, 0, 8);
	tanFOV = Math.tan( THREE.Math.degToRad( camera.fov / 2 ) );
    viewDirection = new THREE.Vector3(0, 0, -1.0).transformDirection(camera.matrixWorld); 
    // init light
    var ambientLight = new THREE.AmbientLight(ambientColor);
    scene.add(ambientLight);
    directionalLight = new THREE.DirectionalLight( 0xffffff, 0.8 );
    directionalLight.position.set(-1, 1, 1);
    scene.add( directionalLight );  
    // materials
    materials = {
        basic: new THREE.MeshBasicMaterial(),
        lambert: new THREE.MeshLambertMaterial(),
        phong: new THREE.MeshPhongMaterial(),
        normal: new THREE.MeshNormalMaterial()
    };
	// Init Elastic Object
    initElasticObject();
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
    // begin render vindaloop
    update();
}

function update() {
	// normalize elastic object
	if(currentElasticObjectState !== elasticObjectState.stretching) {
		geometryStretcher.normalize( elasticObject );
	}
    // render
	renderer.render(scene, camera);
	// loop
	requestAnimationFrame(update);
}

function initElasticObject() {
    if (elasticObject) scene.remove(elasticObject);
    elasticObject = geometryStretcher.elasticMesh(
        geometries[params.model],
        materials[params.material],
        params
    );
    console.log(params.model);
    elasticObject.material.map = (params.model === 'liam') ? headTexture : null;
    elasticObject.material.needsUpdate = true;
    elasticObject.rotation.y = startRotation;
    scene.add(elasticObject);
}

function onPointerStart(event) {
    var pointerPos = GetPointerPosition(event);
	lastPointerPos = new THREE.Vector2().copy( pointerPos );
    pointerStartPosition = new THREE.Vector2().copy( pointerPos );
	raycaster.setFromCamera(normalizedPointerPosition(pointerPos), camera);
	var hits = raycaster.intersectObjects(scene.children, false);
    if (hits.length === 0) {
        currentElasticObjectState = elasticObjectState.rotating;
    } else {
        for (var i = 0; i < hits.length; i++) {
            if(hits[i].object.userData.tag === geometryStretcher.elasticMeshTag) {
                raycastHitInfo = hits[i];
                currentElasticObjectState = elasticObjectState.stretching;
                break;
            }
        }
    }	
}

function onPointerMove(event) {
    if (currentElasticObjectState === elasticObjectState.rest) return;
    event.preventDefault();
	var pointerPos = GetPointerPosition(event);
	var pointerDelta = new THREE.Vector2().copy( lastPointerPos ).sub( pointerPos );
    pointerDelta.y *= -1;
	lastPointerPos.copy( pointerPos );
	if(currentElasticObjectState === elasticObjectState.stretching) {
        var distToPointer = new THREE.Vector2()
            .copy( pointerPos )
            .sub( pointerStartPosition )
            .length();
        if (distToPointer < params.maxStretchDistance) {
            var stretchDistance = 1.0 - distToPointer / params.maxStretchDistance;
    		geometryStretcher.stretch(elasticObject, raycastHitInfo.point, pointerDelta, stretchDistance);                
        } else {
            releasePinch();
        }
	} else if(currentElasticObjectState === elasticObjectState.rotating) {
		elasticObject.rotation.y -= pointerDelta.x * rotateSpeed;
		if (elasticObject.rotation.y < startRotation - Math.PI) {
			elasticObject.rotation.y += Math.PI * 2;
		} else if(elasticObject.rotation.y > startRotation + Math.PI) {
			elasticObject.rotation.y -= Math.PI * 2;
		}
	}
}

function onPointerEnd(event) {    
	if (currentElasticObjectState === elasticObjectState.rest) return;
    event.preventDefault();
    releasePinch();
    currentElasticObjectState = elasticObjectState.rest;
}

function releasePinch() {
    currentElasticObjectState = elasticObjectState.rest;
}

function GetPointerPosition(event) {
	if (event.touches) {
		return new THREE.Vector2(
            event.touches[0].clientX,
            event.touches[0].clientY
        );		
	} else {
        return new THREE.Vector2(
            event.clientX,
            event.clientY
        );
	}
}

function onResizeEvent() {
    var rtWidth = renderTarget.clientWidth;
	var rtHeight = renderTarget.clientHeight;
	renderTargetRect = renderTarget.getBoundingClientRect();
	camera.aspect = rtWidth / rtHeight;
	renderer.setSize( rtWidth, rtHeight );
	camera.updateProjectionMatrix();
}

function normalizedPointerPosition(pointerPosition) {
	var posX = (pointerPosition.x - renderTargetRect.left);
	var posY = (pointerPosition.y - renderTargetRect.top);
	return new THREE.Vector2(
		(posX / renderTarget.clientWidth) * 2 - 1,
		-((posY / renderTarget.clientHeight) * 2 - 1)
	);
}