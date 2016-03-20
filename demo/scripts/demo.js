var THREE = require('three');
var DAT = require('dat-gui');
var geometryStretcher = require('../../modules/geometry-stretcher.js');
var headShader = require('../shaders/head_shader');
var headModel = require('../models/head.json');
// dom elements
var renderTarget = document.getElementById('render-target');
// global state
var renderTargetRect, pointerStartPosition, tanFOV, raycastHitInfo, camera, headTexture;
var scene = new THREE.Scene(),
	renderer = new THREE.WebGLRenderer( { antialias: true, alpha: 1 } ),
	headStartRotation = -Math.PI / 8, 
	raycaster = new THREE.Raycaster(), 
	lastPointerPos = new THREE.Vector2(),
	headStates = {
		rest: 0,
		stretching: 1,
		rotating: 2
    },
	currentHeadState = 0,
	isTouching = false;
// scene objects
var head;
// scene variables
var sceneColor = new THREE.Color(0xdddddd),
	ambientColor = sceneColor,
	framesPerSecond = 60,
	rotateSpeed = 0.01;
// GUI
var gui = new DAT.GUI();
var defaultParams = {
    elasticity: 0.5,
    friction: 0.25,
    stretchRange: 2,
    stretchStrength: 0.003,
    maxStretchDistance: 512
};
var params = {
    model: 0,
    elasticity: 0.5,
    friction: 0.25,
    stretchRange: 2,
    stretchStrength: 0.003,
    maxStretchDistance: 512,
    reset: function () {
        params.elasticity = defaultParams.elasticity;
        params.friction = defaultParams.friction;
    }
};


// Initialize
window.onload = function () {
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

function start () {
    // Init GUI
    gui.add(params, 'model').options({model1: 0, model2: 1, model3: 2}).name('Model');
    gui.add(params, 'elasticity', 0, 1).name('Elasticity').listen();
    gui.add(params, 'friction', 0.1, 1).name('Friction').listen();
    gui.add(params, 'reset').name('Reset');
	// init renderer
    renderTargetRect = renderTarget.getBoundingClientRect();
	renderer.setSize(renderTarget.clientWidth, renderTarget.clientHeight);
	renderTarget.appendChild( renderer.domElement );
	renderer.setClearColor(sceneColor);
	// Init Camera
    camera = new THREE.PerspectiveCamera(45, renderTarget.clientWidth / renderTarget.clientHeight, 0.1, 100)
	camera.position.set(0, 0, 6);
	tanFOV = Math.tan( THREE.Math.degToRad( camera.fov / 2 ) );
    var viewDirection = new THREE.Vector3(0, 0, -1.0).transformDirection(camera.matrixWorld);    
	// Init Head
    var geometry = new THREE.JSONLoader().parse(headModel).geometry;
    head = geometryStretcher.elasticMesh(
        geometry,
        new THREE.ShaderMaterial({
            vertexShader: headShader.vertexShader,
            fragmentShader: headShader.fragmentShader,
            uniforms: {
                texture: { type: "t", value: headTexture },
                uViewDir: { type: 'v3', value: viewDirection },
                uRimWidth: { type: 'f', value: 0.66 },
                uRimIntensity: { type: 'f', value: 0.33 }
            }
        }),
        params
    );
    head.name = 'Head';
    head.castShadow = true;
    head.rotation.y = headStartRotation;
    scene.add( head );
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
	// normalize head
	if(currentHeadState !== headStates.stretching) {
		geometryStretcher.normalize( head );
	}
    // render
	renderer.render(scene, camera);
	// loop
	requestAnimationFrame(update);
}

function onPointerStart(event) {
    var isTouchInput = (event.touches) ? true : false;
    var pointerPos = GetMousePosition(event);
	lastPointerPos = new THREE.Vector2().copy( pointerPos );
    pointerStartPosition = new THREE.Vector2().copy( pointerPos );
	raycaster.setFromCamera(normalizedPointerPosition(pointerPos), camera);
	var hits = raycaster.intersectObjects(scene.children, false);
	for (var i = 0; i < hits.length; i++) {
		if(hits[i].object.name === 'Head') {
			raycastHitInfo = hits[i];
			isTouching = true;
			if (event.which === 1 || isTouchInput) {
				currentHeadState = headStates.stretching;
			} else if (event.which === 3) {
				currentHeadState = headStates.rotating;
			}
			break;
		}
	}
}

function onPointerMove(event) {
    if (!isTouching) return;
    event.preventDefault();
	var pointerPos = GetMousePosition(event);
	var pointerDelta = new THREE.Vector2().copy( lastPointerPos ).sub( pointerPos );
    pointerDelta.y *= -1;
	lastPointerPos.copy( pointerPos );
	if(currentHeadState === headStates.stretching) {
        var distToPointer = new THREE.Vector2()
            .copy( pointerPos )
            .sub( pointerStartPosition )
            .length();
        if (distToPointer < params.maxStretchDistance) {
            var stretchDistance = 1.0 - distToPointer / params.maxStretchDistance;
    		geometryStretcher.stretch(head, raycastHitInfo.point, pointerDelta, stretchDistance);                
        } else {
            releasePinch();
        }
	} else if(currentHeadState === headStates.rotating) {
		head.rotation.y -= pointerDelta.x * rotateSpeed;
		if (head.rotation.y < headStartRotation - Math.PI) {
			head.rotation.y += Math.PI * 2;
		} else if(head.rotation.y > headStartRotation + Math.PI) {
			head.rotation.y -= Math.PI * 2;
		}
	}
}

function onPointerEnd(event) {
	if (!isTouching) return;
    event.preventDefault();
    releasePinch();
    isTouching = false;
}

function releasePinch() {
    currentHeadState = headStates.rest;
}

function GetMousePosition(event) {
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