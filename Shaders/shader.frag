precision mediump float;


uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

const int STEPS = 256;
const float MIN_DIST = .001;
const float MAX_DIST = 64.;
const float MOUSE_SENSITIVITY = 2.;

// SDF Functions

float sdfBox(vec3 p, vec3 s) {
	vec3 q = abs(p) - s;
	return length(max(q, 0.)) + min(max(q.x,max(q.y,q.z)),0.);
}

float sdfSphere(vec3 p, float r) { return length(p) - r; }

vec2 sdfStick(vec3 p, vec4 a, vec4 b) {
    vec3 pa = p.xyz-a.xyz, ba = b.xyz-a.xyz;
	float h = clamp( dot(pa,ba)/dot(ba,ba), 0.0, 1.0 );
	return vec2( length( pa - ba*h ) - mix(a.w,b.w,h*h*(3.0-2.0*h)), h );
}

// Smooth Operators

float smin(float d1, float d2, float k) {
	float h = clamp(0.5+0.5*(d2-d1)/k, 0.,1.);
	return mix(d2,d1,h)-k*h*(1.-h);
}

// Wizardry Matrix Functions
mat2 rot2D(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c);
}


// Raymarching Functions

vec4 map(vec3 p) {
    // p = mod(p-vec3(0.,0.,u_time), 2.0) - 0.5;
    float jumpOffsets = sin(u_time)* 0.1;
    
    float lBody = sdfSphere(p-vec3(0.,jumpOffsets,0.), 0.5);
    float uBody = sdfSphere(p-vec3(0., 0.5, 0.)-vec3(0.,jumpOffsets,0.), 0.33);

    float size = 0.1;
    vec4 pos1 = vec4(-0.1, 0.5, 0., size);
    vec4 pos2 = vec4(.5, 0.5, 0., size/1.25);
    
    vec3 limbP = p;

    limbP = p - vec3(0.35, 0., 0.);
    limbP.yx *= rot2D(sin(u_time*15.)* .05);
    limbP.xz *= rot2D(sin(u_time*10.)* 0.5);
    vec2 leftLimb = sdfStick(limbP-vec3(0.,jumpOffsets,0.), pos1, pos2);

    limbP = p - vec3(-0.35, 0., 0.);
    limbP.yx *= rot2D(sin(u_time*15.)* .05);
    limbP.xz *= rot2D(sin(u_time*10.)* 0.5);
    vec2 rightLimb = sdfStick(limbP-vec3(0.,jumpOffsets,0.), pos1*vec4(-1.,1.,1.,1.), pos2*vec4(-1.,1.,1.,1.));
    
    pos1 = vec4(0.25, -.3, 0., size);
    pos2 = vec4(0.25, -1., 0., size/1.25);

    limbP = p;
    limbP.yz *= rot2D(sin(u_time*10.)* 0.5);
    vec2 leftLeg = sdfStick(limbP-vec3(0.,jumpOffsets,0.), pos1, pos2);


    limbP = p;
    limbP.yz *= rot2D(-sin((u_time*10.))* 0.5);
    vec2 rightLeg = sdfStick(limbP-vec3(0.,jumpOffsets,0.), pos1*vec4(-1.,1.,1.,1.), pos2*vec4(-1.,1.,1.,1.));


    float legs = min(leftLeg.x, rightLeg.x);
    float limbs = min(legs, min(leftLimb.x, rightLimb.x));

    float ground = p.y + 2.;



    float m = min(ground, smin(limbs, smin(lBody, uBody, .25), 0.1));
    
    vec3 col;

    // Colors 
    vec3 lbCol = vec3(0.4392, 0.3529, 0.1608);
    vec3 ubCol = vec3(0.4392, 0.3529, 0.1608);
    vec3 limbCol = vec3(0.4392, 0.3529, 0.1608);
    col = mix(col, lbCol, clamp(1.-lBody, 0.,1.)); // Lower bod
    col = mix(col, ubCol, clamp(1.-uBody, 0.,1.)); // Upper bod
    col = mix(col, limbCol, clamp(pow(1.-limbs, 100.), 0.,1.)); // Arms
    col = mix(col, vec3(0.102, 0.0902, 0.0667), clamp(1.-ground, 0.,1.)); // Ground


    return vec4(col, m);
}

vec4 rayMarch(vec3 ro, vec3 rd, float max_dist) {
    float dist = 0.;
    vec4 m = vec4(0.);
    for(int i = 0; i < STEPS; i++) {
        vec3 p = ro + rd * dist;
        m = map(p); // get world sdf map

        if(m.w < MIN_DIST) break; // if ray is close enough, break.

        dist += m.w;

        if(dist > MAX_DIST) break; //if total distance reach max, break.
    }

    vec4 d = vec4(m.xyz, dist);
    return d;
}

vec3 getNormal(vec3 p) {
    vec2 d = vec2(.01, 0.);
    float gx = map(p + d.xyy).w - map(p - d.xyy).w;
    float gy = map(p + d.yxy).w - map(p - d.yxy).w;
    float gz = map(p + d.yyx).w - map(p - d.yyx).w;
    return normalize(vec3(gx,gy,gz));
}


vec3 render(vec2 uv) {
    vec3 color = vec3(0.0);

    // Mouse Rotation?
    vec2 m = (u_mouse.xy * 2. - u_resolution.xy) / u_resolution.y;

    // Initialization
    vec3 ro = vec3(0.,0.,-3.);
    vec3 rd = vec3(uv, 1.);

    ro.yz *= rot2D(-m.y * MOUSE_SENSITIVITY);
    rd.yz *= rot2D(-m.y * MOUSE_SENSITIVITY);

    ro.xz *= rot2D(-m.x * MOUSE_SENSITIVITY + (u_time/5.));
    rd.xz *= rot2D(-m.x * MOUSE_SENSITIVITY + (u_time/5.));

    // Ray march
    vec4 dist = rayMarch(ro, rd, MAX_DIST);

    if (dist.w < MAX_DIST) {
        color = vec3(1.);

        // Get Normals
        vec3 p = ro + rd * dist.w;
        vec3 normal = getNormal(p);

        // Diffuse Lighting
        vec3 lightPos = normalize(vec3(5., 15., 5.));
        float hlDiffuse = dot(normal, lightPos)*0.5+0.5;

        // Specular Lighting
        vec3 reflectDir = normalize(reflect(-lightPos, normal));
        float specular = max(0., dot(normalize(ro), reflectDir));
        specular = clamp(pow(specular, 64.), 0., 1.);
        
        // Normal Shading --> Simple Cel-Shading
        hlDiffuse = clamp(floor(hlDiffuse * 3.) /3. + .25, 0., 1.); 
        specular = floor(specular* 4.);



        color = clamp(hlDiffuse + specular,0.,1.) * dist.xyz;
        //color = dist.xyz;
    }
    else { // "Skybox"/Background
        color = mix(vec3(0.0, 0.4588, 0.9804), vec3(1.0, 1.0, 1.0), pow(1.-max(0.,(uv.y + 0.25) + (m.y*2.5)), 2.));
    }

    return color;
}

void main() {
    vec2 uv = 2. * gl_FragCoord.xy / u_resolution - 1.;
    uv.x *= u_resolution.x / u_resolution.y; 

    gl_FragColor = vec4(render(uv), 1.);
}