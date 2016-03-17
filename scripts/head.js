var THREE = require('three');
var help = require('./helper');
var geometryStretcher = require('./geometry-stretcher.js');
var headShader = require('../shaders/head_shader');
var headModel = require('../assets/models/head.json');
// dom elements
var renderTarget = document.getElementById('render-target');
// global state
var renderTargetRect, pointerStartPosition, alignStartRotation, alignStartTime, 
alignTimeout, tanFOV, raycastHitInfo, camera, stretchDistFactor, headTexture;
var outlineScene = new THREE.Scene(),
	headScene = new THREE.Scene(),
	renderer = new THREE.WebGLRenderer( { antialias: true } ),
	headStartRotation = -Math.PI / 8, 
	raycaster = new THREE.Raycaster(), 
	lastPointerPos = new THREE.Vector2(),
	headStates = {
		rest: 0,
		stretching: 1,
		rotating: 2,
		aligning: 3 },
	currentHeadState = 0,
	isTouching = false;
// scene objects
var head, headOutline;
// scene variables
var sceneColor = new THREE.Color(0x000000),
	ambientColor = sceneColor,
	outlineColor = new THREE.Color( 0xffffff ),
	outlineWidth = 0.02,
	framesPerSecond = 60,
    alignDelay = 2000,
	alignDuration = 2000,
	rotateSpeed = 0.01;

window.onload =  function () {
    var textureLoader = new THREE.TextureLoader();
    textureLoader.load(
        './assets/images/head.png',
        function (texture) {
            headTexture = texture;
            start();
        }
    );
}

function start () {
	renderTargetRect = renderTarget.getBoundingClientRect();
	// init renderer
	renderer.setSize(renderTarget.clientWidth, renderTarget.clientHeight);
	renderTarget.appendChild( renderer.domElement );
	renderer.setClearColor(sceneColor, 1);
	renderer.autoClear = false;
	// init camera
    camera = new THREE.PerspectiveCamera(45, renderTarget.clientWidth / renderTarget.clientHeight, 0.1, 100)
	camera.position.set(0, 0, 6);
	tanFOV = Math.tan( THREE.Math.degToRad( camera.fov / 2 ) );
    var viewDirection = new THREE.Vector3(0, 0, -1.0).transformDirection(camera.matrixWorld);    
	// HEAD
    var geometry = new THREE.JSONLoader().parse(headModel).geometry;
    var headMeshProperties = geometryStretcher.elasticMeshProperties(
        0.5, // elasticity
        0.25, // friction
        2.0, // stretch range factor
        0.003, // stretch factor
        400.0 // max stretch distance
    );
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
        headMeshProperties
    );
    head.name = 'Head';
    head.castShadow = true;
    head.rotation.y = headStartRotation;
    headScene.add( head );
    // Outline
    headOutline = geometryStretcher.elasticMesh(
        geometry,
        new THREE.MeshBasicMaterial({
            color: outlineColor
        }),
        headMeshProperties
    );
    var headOutlineScale = head.scale.x + outlineWidth;
    headOutline.scale.set(headOutlineScale, headOutlineScale, headOutlineScale);
    headOutline.rotation.y = headStartRotation;
    outlineScene.add( headOutline );
    // init events
    window.addEventListener('resize', onResizeEvent, false);
    onResizeEvent();
    window.addEventListener('scroll', onScrollEvent, false);
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
	if(currentHeadState === headStates.aligning) {
		alignHead();
	}
    // render
	render();
	// loop
	requestAnimationFrame(update);
}

function render() {
    renderer.clear();
	renderer.render(outlineScene, camera);
	renderer.clearDepth();
	renderer.render(headScene, camera);
}

function onPointerStart(event) {
    var isTouchInput = (event.touches) ? true : false;
    var pointerPos = GetMousePosition(event);
	lastPointerPos = new THREE.Vector2().copy( pointerPos );
    pointerStartPosition = new THREE.Vector2().copy( pointerPos );
	raycaster.setFromCamera(normalizedPointerPosition(pointerPos), camera);
	var hits = raycaster.intersectObjects(headScene.children, false);
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
        if (distToPointer < head.userData.meshProperties.maxStretchDist) {
            stretchDistFactor = 1.0 - distToPointer / head.userData.meshProperties.maxStretchDist;
    		geometryStretcher.stretch(head, raycastHitInfo.point, pointerDelta, stretchDistFactor);                
        } else {
            releasePinch();
        }
	} else if(currentHeadState === headStates.rotating) {
		head.rotation.y -= pointerDelta.x * rotateSpeed;
		headOutline.rotation.copy(head.rotation);
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
    triggerHeadAlign();    
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

function onScrollEvent() {
	renderTargetRect = renderTarget.getBoundingClientRect();
}

function triggerHeadAlign() {
	if (alignTimeout) clearTimeout(alignTimeout);
	alignTimeout = setTimeout(function() {
		if (currentHeadState === headStates.rest) {
			currentHeadState = headStates.aligning;
			alignStartRotation = head.rotation.y;
			alignStartTime = Date.now();
		}
	}, alignDelay);
}

function alignHead() {
	if (head.rotation.y === headStartRotation) {
		currentHeadState = headStates.rest;
	} else {
		var timeElapsed = Date.now() - alignStartTime;
		var t = timeElapsed / alignDuration;
		var alpha = help.smootherstep(0, 1, t);
		head.rotation.y = help.lerp(alignStartRotation, headStartRotation, alpha);
		headOutline.rotation.copy(head.rotation);
	}
}

function normalizedPointerPosition(pointerPosition) {
	var posX = (pointerPosition.x - renderTargetRect.left);
	var posY = (pointerPosition.y - renderTargetRect.top);
	return new THREE.Vector2(
		(posX / renderTarget.clientWidth) * 2 - 1,
		-((posY / renderTarget.clientHeight) * 2 - 1)
	);
}