module.exports=[12541,(a,b,c)=>{let{createClientModuleProxy:d}=a.r(43238);a.n(d("[project]/Dokumenty/casn/node_modules/next/dist/client/app-dir/link.js <module evaluation>"))},61814,(a,b,c)=>{let{createClientModuleProxy:d}=a.r(43238);a.n(d("[project]/Dokumenty/casn/node_modules/next/dist/client/app-dir/link.js"))},29990,a=>{"use strict";a.i(12541);var b=a.i(61814);a.n(b)},23796,(a,b,c)=>{"use strict";Object.defineProperty(c,"__esModule",{value:!0});var d={default:function(){return i},useLinkStatus:function(){return h.useLinkStatus}};for(var e in d)Object.defineProperty(c,e,{enumerable:!0,get:d[e]});let f=a.r(29160),g=a.r(50554),h=f._(a.r(29990));function i(a){let b=a.legacyBehavior,c="string"==typeof a.children||"number"==typeof a.children||"string"==typeof a.children?.type,d=a.children?.type?.$$typeof===Symbol.for("react.client.reference");return!b||c||d||(a.children?.type?.$$typeof===Symbol.for("react.lazy")?console.error("Using a Lazy Component as a direct child of `<Link legacyBehavior>` from a Server Component is not supported. If you need legacyBehavior, wrap your Lazy Component in a Client Component that renders the Link's `<a>` tag."):console.error("Using a Server Component as a direct child of `<Link legacyBehavior>` is not supported. If you need legacyBehavior, wrap your Server Component in a Client Component that renders the Link's `<a>` tag.")),(0,g.jsx)(h.default,{...a})}("function"==typeof c.default||"object"==typeof c.default&&null!==c.default)&&void 0===c.default.__esModule&&(Object.defineProperty(c.default,"__esModule",{value:!0}),Object.assign(c.default,c),b.exports=c.default)},52723,(a,b,c)=>{"use strict";c._=function(a){return a&&a.__esModule?a:{default:a}}},86460,(a,b,c)=>{"use strict";Object.defineProperty(c,"__esModule",{value:!0}),Object.defineProperty(c,"warnOnce",{enumerable:!0,get:function(){return d}});let d=a=>{}},71497,(a,b,c)=>{"use strict";Object.defineProperty(c,"__esModule",{value:!0});var d={getDeploymentId:function(){return f},getDeploymentIdQueryOrEmptyString:function(){return g}};for(var e in d)Object.defineProperty(c,e,{enumerable:!0,get:d[e]});function f(){return!1}function g(){return""}},72168,(a,b,c)=>{"use strict";function d({widthInt:a,heightInt:b,blurWidth:c,blurHeight:d,blurDataURL:e,objectFit:f}){let g=c?40*c:a,h=d?40*d:b,i=g&&h?`viewBox='0 0 ${g} ${h}'`:"";return`%3Csvg xmlns='http://www.w3.org/2000/svg' ${i}%3E%3Cfilter id='b' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3CfeColorMatrix values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 100 -1' result='s'/%3E%3CfeFlood x='0' y='0' width='100%25' height='100%25'/%3E%3CfeComposite operator='out' in='s'/%3E%3CfeComposite in2='SourceGraphic'/%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3C/filter%3E%3Cimage width='100%25' height='100%25' x='0' y='0' preserveAspectRatio='${i?"none":"contain"===f?"xMidYMid":"cover"===f?"xMidYMid slice":"none"}' style='filter: url(%23b);' href='${e}'/%3E%3C/svg%3E`}Object.defineProperty(c,"__esModule",{value:!0}),Object.defineProperty(c,"getImageBlurSvg",{enumerable:!0,get:function(){return d}})},96228,(a,b,c)=>{"use strict";Object.defineProperty(c,"__esModule",{value:!0});var d={VALID_LOADERS:function(){return f},imageConfigDefault:function(){return g}};for(var e in d)Object.defineProperty(c,e,{enumerable:!0,get:d[e]});let f=["default","imgix","cloudinary","akamai","custom"],g={deviceSizes:[640,750,828,1080,1200,1920,2048,3840],imageSizes:[32,48,64,96,128,256,384],path:"/_next/image",loader:"default",loaderFile:"",domains:[],disableStaticImages:!1,minimumCacheTTL:14400,formats:["image/webp"],maximumRedirects:3,dangerouslyAllowLocalIP:!1,dangerouslyAllowSVG:!1,contentSecurityPolicy:"script-src 'none'; frame-src 'none'; sandbox;",contentDispositionType:"attachment",localPatterns:void 0,remotePatterns:[],qualities:[75],unoptimized:!1}},6455,(a,b,c)=>{"use strict";Object.defineProperty(c,"__esModule",{value:!0}),Object.defineProperty(c,"getImgProps",{enumerable:!0,get:function(){return j}}),a.r(86460);let d=a.r(71497),e=a.r(72168),f=a.r(96228),g=["-moz-initial","fill","none","scale-down",void 0];function h(a){return void 0!==a.default}function i(a){return void 0===a?a:"number"==typeof a?Number.isFinite(a)?a:NaN:"string"==typeof a&&/^[0-9]+$/.test(a)?parseInt(a,10):NaN}function j({src:a,sizes:b,unoptimized:c=!1,priority:j=!1,preload:k=!1,loading:l,className:m,quality:n,width:o,height:p,fill:q=!1,style:r,overrideSrc:s,onLoad:t,onLoadingComplete:u,placeholder:v="empty",blurDataURL:w,fetchPriority:x,decoding:y="async",layout:z,objectFit:A,objectPosition:B,lazyBoundary:C,lazyRoot:D,...E},F){var G;let H,I,J,{imgConf:K,showAltText:L,blurComplete:M,defaultLoader:N}=F,O=K||f.imageConfigDefault;if("allSizes"in O)H=O;else{let a=[...O.deviceSizes,...O.imageSizes].sort((a,b)=>a-b),b=O.deviceSizes.sort((a,b)=>a-b),c=O.qualities?.sort((a,b)=>a-b);H={...O,allSizes:a,deviceSizes:b,qualities:c}}if(void 0===N)throw Object.defineProperty(Error("images.loaderFile detected but the file is missing default export.\nRead more: https://nextjs.org/docs/messages/invalid-images-config"),"__NEXT_ERROR_CODE",{value:"E163",enumerable:!1,configurable:!0});let P=E.loader||N;delete E.loader,delete E.srcSet;let Q="__next_img_default"in P;if(Q){if("custom"===H.loader)throw Object.defineProperty(Error(`Image with src "${a}" is missing "loader" prop.
Read more: https://nextjs.org/docs/messages/next-image-missing-loader`),"__NEXT_ERROR_CODE",{value:"E252",enumerable:!1,configurable:!0})}else{let a=P;P=b=>{let{config:c,...d}=b;return a(d)}}if(z){"fill"===z&&(q=!0);let a={intrinsic:{maxWidth:"100%",height:"auto"},responsive:{width:"100%",height:"auto"}}[z];a&&(r={...r,...a});let c={responsive:"100vw",fill:"100vw"}[z];c&&!b&&(b=c)}let R="",S=i(o),T=i(p);if((G=a)&&"object"==typeof G&&(h(G)||void 0!==G.src)){let b=h(a)?a.default:a;if(!b.src)throw Object.defineProperty(Error(`An object should only be passed to the image component src parameter if it comes from a static image import. It must include src. Received ${JSON.stringify(b)}`),"__NEXT_ERROR_CODE",{value:"E460",enumerable:!1,configurable:!0});if(!b.height||!b.width)throw Object.defineProperty(Error(`An object should only be passed to the image component src parameter if it comes from a static image import. It must include height and width. Received ${JSON.stringify(b)}`),"__NEXT_ERROR_CODE",{value:"E48",enumerable:!1,configurable:!0});if(I=b.blurWidth,J=b.blurHeight,w=w||b.blurDataURL,R=b.src,!q)if(S||T){if(S&&!T){let a=S/b.width;T=Math.round(b.height*a)}else if(!S&&T){let a=T/b.height;S=Math.round(b.width*a)}}else S=b.width,T=b.height}let U=!j&&!k&&("lazy"===l||void 0===l);(!(a="string"==typeof a?a:R)||a.startsWith("data:")||a.startsWith("blob:"))&&(c=!0,U=!1),H.unoptimized&&(c=!0),Q&&!H.dangerouslyAllowSVG&&a.split("?",1)[0].endsWith(".svg")&&(c=!0);let V=i(n),W=Object.assign(q?{position:"absolute",height:"100%",width:"100%",left:0,top:0,right:0,bottom:0,objectFit:A,objectPosition:B}:{},L?{}:{color:"transparent"},r),X=M||"empty"===v?null:"blur"===v?`url("data:image/svg+xml;charset=utf-8,${(0,e.getImageBlurSvg)({widthInt:S,heightInt:T,blurWidth:I,blurHeight:J,blurDataURL:w||"",objectFit:W.objectFit})}")`:`url("${v}")`,Y=g.includes(W.objectFit)?"fill"===W.objectFit?"100% 100%":"cover":W.objectFit,Z=X?{backgroundSize:Y,backgroundPosition:W.objectPosition||"50% 50%",backgroundRepeat:"no-repeat",backgroundImage:X}:{},$=function({config:a,src:b,unoptimized:c,width:e,quality:f,sizes:g,loader:h}){if(c){let a=(0,d.getDeploymentId)();if(b.startsWith("/")&&!b.startsWith("//")&&a){let c=b.includes("?")?"&":"?";b=`${b}${c}dpl=${a}`}return{src:b,srcSet:void 0,sizes:void 0}}let{widths:i,kind:j}=function({deviceSizes:a,allSizes:b},c,d){if(d){let c=/(^|\s)(1?\d?\d)vw/g,e=[];for(let a;a=c.exec(d);)e.push(parseInt(a[2]));if(e.length){let c=.01*Math.min(...e);return{widths:b.filter(b=>b>=a[0]*c),kind:"w"}}return{widths:b,kind:"w"}}return"number"!=typeof c?{widths:a,kind:"w"}:{widths:[...new Set([c,2*c].map(a=>b.find(b=>b>=a)||b[b.length-1]))],kind:"x"}}(a,e,g),k=i.length-1;return{sizes:g||"w"!==j?g:"100vw",srcSet:i.map((c,d)=>`${h({config:a,src:b,quality:f,width:c})} ${"w"===j?c:d+1}${j}`).join(", "),src:h({config:a,src:b,quality:f,width:i[k]})}}({config:H,src:a,unoptimized:c,width:S,quality:V,sizes:b,loader:P}),_=U?"lazy":l;return{props:{...E,loading:_,fetchPriority:x,width:S,height:T,decoding:y,className:m,style:{...W,...Z},sizes:$.sizes,srcSet:$.srcSet,src:s||$.src},meta:{unoptimized:c,preload:k||j,placeholder:v,fill:q}}}},61731,(a,b,c)=>{let{createClientModuleProxy:d}=a.r(43238);a.n(d("[project]/Dokumenty/casn/node_modules/next/dist/client/image-component.js <module evaluation>"))},45532,(a,b,c)=>{let{createClientModuleProxy:d}=a.r(43238);a.n(d("[project]/Dokumenty/casn/node_modules/next/dist/client/image-component.js"))},67613,a=>{"use strict";a.i(61731);var b=a.i(45532);a.n(b)},19801,(a,b,c)=>{"use strict";function d(a,b){let c=a||75;return b?.qualities?.length?b.qualities.reduce((a,b)=>Math.abs(b-c)<Math.abs(a-c)?b:a,0):c}Object.defineProperty(c,"__esModule",{value:!0}),Object.defineProperty(c,"findClosestQuality",{enumerable:!0,get:function(){return d}})},67092,(a,b,c)=>{"use strict";Object.defineProperty(c,"__esModule",{value:!0}),Object.defineProperty(c,"default",{enumerable:!0,get:function(){return g}});let d=a.r(19801),e=a.r(71497);function f({config:a,src:b,width:c,quality:f}){if(b.startsWith("/")&&b.includes("?")&&a.localPatterns?.length===1&&"**"===a.localPatterns[0].pathname&&""===a.localPatterns[0].search)throw Object.defineProperty(Error(`Image with src "${b}" is using a query string which is not configured in images.localPatterns.
Read more: https://nextjs.org/docs/messages/next-image-unconfigured-localpatterns`),"__NEXT_ERROR_CODE",{value:"E871",enumerable:!1,configurable:!0});let g=(0,d.findClosestQuality)(f,a),h=(0,e.getDeploymentId)();return`${a.path}?url=${encodeURIComponent(b)}&w=${c}&q=${g}${b.startsWith("/")&&h?`&dpl=${h}`:""}`}f.__next_img_default=!0;let g=f},24523,(a,b,c)=>{"use strict";Object.defineProperty(c,"__esModule",{value:!0});var d={default:function(){return k},getImageProps:function(){return j}};for(var e in d)Object.defineProperty(c,e,{enumerable:!0,get:d[e]});let f=a.r(52723),g=a.r(6455),h=a.r(67613),i=f._(a.r(67092));function j(a){let{props:b}=(0,g.getImgProps)(a,{defaultLoader:i.default,imgConf:{deviceSizes:[640,750,828,1080,1200,1920,2048,3840],imageSizes:[32,48,64,96,128,256,384],qualities:[75],path:"/_next/image",loader:"default",dangerouslyAllowSVG:!1,unoptimized:!0}});for(let[a,c]of Object.entries(b))void 0===c&&delete b[a];return{props:b}}let k=h.Image},17015,(a,b,c)=>{b.exports=a.r(24523)},51103,a=>{"use strict";var b=a.i(50554),c=a.i(23796);function d(){return(0,b.jsxs)("header",{id:"topnav",className:"defaultscroll scroll-active",role:"banner",children:[(0,b.jsx)("div",{className:"tagline",children:(0,b.jsxs)("div",{className:"container",children:[(0,b.jsx)("div",{className:"float-right",children:(0,b.jsx)("ul",{className:"topbar-list list-unstyled d-flex",style:{margin:"11px 0px"},role:"list",children:(0,b.jsx)("li",{className:"list-inline-item",role:"listitem",children:(0,b.jsxs)("a",{href:"mailto:p.balcerowski@sluzbaniepodleglej.pl","aria-label":"Wyślij email do Piotra Balcerowskiego",children:[(0,b.jsx)("i",{className:"mdi mdi-email mr-1 text-custom","aria-hidden":"true"}),"Email : p.balcerowski@sluzbaniepodleglej.pl"]})})})}),(0,b.jsx)("div",{className:"clearfix"})]})}),(0,b.jsxs)("div",{className:"container",children:[(0,b.jsx)("div",{className:"menu-extras",children:(0,b.jsx)("div",{className:"menu-item",children:(0,b.jsx)("button",{className:"navbar-toggle","aria-expanded":"false","aria-controls":"navigation","aria-label":"Przełącz menu nawigacyjne",type:"button",children:(0,b.jsxs)("div",{className:"lines","aria-hidden":"true",children:[(0,b.jsx)("span",{}),(0,b.jsx)("span",{}),(0,b.jsx)("span",{})]})})})}),(0,b.jsx)("nav",{id:"navigation","aria-label":"Menu główne",role:"navigation",children:(0,b.jsxs)("ul",{className:"navigation-menu",role:"list",children:[(0,b.jsx)("li",{className:"active",role:"listitem",children:(0,b.jsx)(c.default,{href:"/","aria-current":"page",children:"Strona główna"})}),(0,b.jsx)("li",{className:"active",role:"listitem",children:(0,b.jsx)(c.default,{href:"/autorzy",children:"Autorzy"})}),(0,b.jsx)("li",{className:"active",role:"listitem",children:(0,b.jsx)(c.default,{href:"/zbiory",children:"Zbiory analiz"})}),(0,b.jsx)("li",{role:"listitem",children:(0,b.jsx)(c.default,{href:"/kontakt",children:"Kontakt"})})]})})]})]})}a.s(["default",()=>d])},91809,(a,b,c)=>{let{createClientModuleProxy:d}=a.r(43238);a.n(d("[project]/Dokumenty/casn/node_modules/next/dist/client/script.js <module evaluation>"))},4278,(a,b,c)=>{let{createClientModuleProxy:d}=a.r(43238);a.n(d("[project]/Dokumenty/casn/node_modules/next/dist/client/script.js"))},1156,a=>{"use strict";a.i(91809);var b=a.i(4278);a.n(b)},72320,(a,b,c)=>{b.exports=a.r(1156)},84237,a=>{a.v({className:"roboto_1fb833fc-module__z-d8BW__className",variable:"roboto_1fb833fc-module__z-d8BW__variable"})},62270,a=>{a.v({className:"rubik_e4f1fdea-module__J_z7Xa__className",variable:"rubik_e4f1fdea-module__J_z7Xa__variable"})},90326,a=>{"use strict";var b=a.i(50554),c=a.i(72320),d=a.i(51103),e=a.i(17015),f=a.i(23796);function g(){return(0,b.jsx)("section",{className:"bg-footer",children:(0,b.jsxs)("div",{className:"container",children:[(0,b.jsxs)("div",{className:"row",children:[(0,b.jsxs)("div",{className:"col-lg-3 col-sm-6",children:[(0,b.jsxs)("h4",{className:"text-uppercase footer-title mt-2 d-flex align-items-center gap-2",children:[(0,b.jsx)(e.default,{src:"/images/logo.jpg",alt:"CASN logo",width:280,height:65,className:"logo-light",style:{height:"28px",width:"auto"},priority:!0}),(0,b.jsx)(f.default,{href:"/",className:"text-white text-decoration-none",children:"CASN"})]}),(0,b.jsxs)("ul",{className:"footer-icons text-white-50 list-inline mt-3",children:[(0,b.jsx)("li",{className:"list-inline-item",children:(0,b.jsx)("a",{href:"https://www.facebook.com/100094527270878",target:"_blank",rel:"noopener noreferrer",children:(0,b.jsx)("i",{className:"mdi mdi-facebook"})})}),(0,b.jsx)("li",{className:"list-inline-item",children:(0,b.jsx)("a",{href:"https://twitter.com/fundacjasluzba",target:"_blank",rel:"noopener noreferrer",children:(0,b.jsx)("i",{className:"mdi mdi-twitter"})})}),(0,b.jsx)("li",{className:"list-inline-item",children:(0,b.jsx)("a",{href:"https://www.instagram.com/fundacja_sluzba_niepodleglej/",target:"_blank",rel:"noopener noreferrer",children:(0,b.jsx)("i",{className:"mdi mdi-instagram"})})})]})]}),(0,b.jsx)("div",{className:"col-lg-3 col-sm-6",children:(0,b.jsxs)("div",{className:"d-flex flex-column align-items-center align-items-sm-start text-center text-sm-start",children:[(0,b.jsx)("h6",{className:"text-white footer-title mt-2 mb-3",children:"Fundacja Służba Niepodległej"}),(0,b.jsx)(e.default,{src:"/images/sn.webp",alt:"Fundacja Służba Niepodległej logo",width:400,height:134,className:"logo-light",style:{height:"40px",width:"auto"}}),(0,b.jsxs)("ul",{className:"list-unstyled company-sub-menu mt-2",children:[(0,b.jsx)("li",{children:(0,b.jsx)("a",{href:"https://sluzbaniepodleglej.pl",className:"text-white-50",children:"Strona Główna"})}),(0,b.jsx)("li",{children:(0,b.jsx)("a",{href:"https://www.youtube.com/playlist?list=PLk-0yaidO8uNWIu5q1OoTQWJjdkE20WI9",className:"text-white-50",children:"Podcasty Niepodległej"})}),(0,b.jsx)("li",{children:(0,b.jsx)("a",{href:"https://www.youtube.com/playlist?list=PLk-0yaidO8uMNwMGoa_aNS745Y0Cnqk8d",className:"text-white-50",children:"Rozmowy Niepodległej"})}),(0,b.jsx)("li",{children:(0,b.jsx)("a",{href:"https://sluzbaniepodleglej.pl/wspomoz-nas/",className:"text-white-50",children:"Wesprzyj nas"})})]})]})}),(0,b.jsx)("div",{className:"col-lg-3 col-sm-6",children:(0,b.jsxs)("div",{className:"d-flex flex-column align-items-center align-items-sm-start text-center text-sm-start",children:[(0,b.jsx)("h6",{className:"text-white footer-title mt-2 mb-3",children:"Mazowieści"}),(0,b.jsx)(e.default,{src:"/images/mazo.png",alt:"Mazowieści logo",width:400,height:134,className:"logo-light",style:{height:"40px",width:"auto"}}),(0,b.jsxs)("ul",{className:"list-unstyled company-sub-menu mt-2 mb-0",children:[(0,b.jsx)("li",{children:(0,b.jsx)("a",{href:"https://mazowiesci.pl",className:"text-white-50",children:"Strona Główna"})}),(0,b.jsx)("li",{children:(0,b.jsx)("a",{href:"https://mazowiesci.pl/category/felietony/",className:"text-white-50",children:"Felietony"})}),(0,b.jsx)("li",{children:(0,b.jsx)("a",{href:"https://mazowiesci.pl/category/warszawa/",className:"text-white-50",children:"Warszawa"})}),(0,b.jsx)("li",{children:(0,b.jsx)("a",{href:"https://mazowiesci.pl/category/mazowieckie/",className:"text-white-50",children:"Mazowieckie"})})]})]})}),(0,b.jsx)("div",{className:"col-lg-12 mt-3",children:(0,b.jsx)(e.default,{src:"/images/PROO_zestawienie_1_plik_edytowalny_KOLOR_CASN.webp",alt:"Baner PROO",width:1920,height:500,className:"logo-light w-100 h-auto",priority:!0,sizes:"100vw"})})]}),(0,b.jsx)("hr",{className:"footer-border"}),(0,b.jsx)("div",{className:"row",children:(0,b.jsx)("div",{className:"col-lg-12",children:(0,b.jsxs)("div",{className:"text-white-50 d-flex justify-content-between flex-wrap",children:[(0,b.jsx)("div",{className:"mt-2",children:(0,b.jsx)("p",{className:"mb-0",children:(0,b.jsx)("a",{href:"https://sluzbaniepodleglej.pl/wp-content/uploads/2023/05/FSN_daneosobowe.pdf",className:"text-white-50",target:"_blank",rel:"noopener noreferrer",children:"Polityka prywatności"})})}),(0,b.jsxs)("div",{className:"mt-2 text-end",children:[(0,b.jsx)("p",{className:"mb-0",children:"2019 © Kevix. Design By Zoyothemes."}),(0,b.jsxs)("p",{className:"mb-0",children:["Maintenance By"," ",(0,b.jsx)("a",{href:"https://ppsolutions.com.pl/",target:"_blank",rel:"noopener noreferrer",style:{color:"inherit",textDecoration:"none"},children:"PP Solutions P.S.A."})]})]})]})})})]})})}function h(){return(0,b.jsx)("section",{className:"section-sm bg-custom",children:(0,b.jsx)("div",{className:"container",children:(0,b.jsxs)("div",{className:"row align-items-center",children:[(0,b.jsxs)("div",{className:"col-lg-8 text-white",children:[(0,b.jsx)("h4",{className:"mb-3",children:"Dołącz do drużyny Służby Niepodleglej!"}),(0,b.jsx)("p",{className:"mb-0 mo-mb-20 cta-desc text-white",children:"Każda złotówka przybliża nas do wydania kolejnych analiz."})]}),(0,b.jsx)("div",{className:"col-md-4 text-center",children:(0,b.jsx)("a",{href:"https://sluzbaniepodleglej.pl/wspomoz-nas/",className:"btn btn-light",children:"Wspomóż nas"})})]})})})}function i(){return(0,b.jsx)(b.Fragment,{children:(0,b.jsx)(c.default,{id:"mobile-menu",dangerouslySetInnerHTML:{__html:`
          // Mobile menu toggle functionality
          document.addEventListener('DOMContentLoaded', function() {
            console.log('DOM loaded, initializing mobile menu...');

            const navbarToggle = document.querySelector('.navbar-toggle');
            const lines = document.querySelector('.navbar-toggle .lines');
            const navigation = document.querySelector('#navigation');

            console.log('Elements found:', { navbarToggle: !!navbarToggle, lines: !!lines, navigation: !!navigation });

            if (navbarToggle && lines && navigation) {
              console.log('Setting up event listeners...');

              navbarToggle.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('Hamburger menu clicked!');

                const isExpanded = navbarToggle.getAttribute('aria-expanded') === 'true';

                // Toggle hamburger animation
                lines.classList.toggle('open');
                console.log('Lines class toggled:', lines.classList.contains('open'));

                // Update ARIA expanded state
                navbarToggle.setAttribute('aria-expanded', (!isExpanded).toString());

                // Toggle navigation visibility
                if (navigation.style.display === 'block') {
                  navigation.style.display = 'none';
                  navigation.classList.remove('open');
                  console.log('Menu hidden');
                } else {
                  navigation.style.display = 'block';
                  navigation.classList.add('open');
                  console.log('Menu shown');
                }
              });

              function closeMenu() {
                lines.classList.remove('open');
                navigation.style.display = 'none';
                navigation.classList.remove('open');
                navbarToggle.setAttribute('aria-expanded', 'false');
              }

              // Close menu when clicking on a link (mobile)
              const navLinks = navigation.querySelectorAll('a');
              console.log('Found navigation links:', navLinks.length);

              navLinks.forEach((link, index) => {
                link.addEventListener('click', function() {
                  console.log('Link clicked:', index);
                  if (window.innerWidth <= 991) {
                    closeMenu();
                    console.log('Menu closed after link click');
                  }
                });
              });

              // Close menu when clicking outside (mobile)
              document.addEventListener('click', function(event) {
                if (window.innerWidth <= 991 &&
                    !navbarToggle.contains(event.target) &&
                    !navigation.contains(event.target)) {
                  closeMenu();
                  console.log('Menu closed after clicking outside');
                }
              });

              // Handle window resize
              window.addEventListener('resize', function() {
                if (window.innerWidth > 991) {
                  closeMenu();
                  console.log('Window resized to desktop, menu reset');
                }
              });

              console.log('Mobile menu initialized successfully');
            } else {
              console.error('Could not find required elements for mobile menu');
            }
          });
        `}})})}var j=a.i(84237);let k={className:j.default.className,style:{fontFamily:"'Roboto', 'Roboto Fallback'",fontStyle:"normal"}};null!=j.default.variable&&(k.variable=j.default.variable);var l=a.i(62270);let m={className:l.default.className,style:{fontFamily:"'Rubik', 'Rubik Fallback'",fontStyle:"normal"}};null!=l.default.variable&&(m.variable=l.default.variable);let n={metadataBase:new URL("https://casn.pl"),title:"Centrum Analiz Służby Niepodległej",description:"Strona Centrum Analiz Fundacji Służby Niepodległej",keywords:"centrum analiz, fundacja służba niepodległej, ngo, analizy polityczne",authors:[{name:"Zoyothemes"}],icons:{icon:"/images/favicon.ico",shortcut:"/images/favicon.ico",apple:"/apple-touch-icon.png"},verification:{google:"m2YyW7pzg0z3nL2idpMZ2finxS8sCwvYKOe4whiY3kA"},openGraph:{images:"/images/home2.webp",title:"Centrum Analiz Służby Niepodległej",description:"Analizy polityki i społeczeństwa"},twitter:{card:"summary_large_image",title:"Centrum Analiz Służby Niepodległej",description:"Analizy polityki i społeczeństwa"},alternates:{canonical:"https://casn.pl"},robots:{index:!0,follow:!0,googleBot:{index:!0,follow:!0}}};function o({children:a}){return(0,b.jsx)("html",{lang:"pl",className:`${k.variable} ${m.variable}`,children:(0,b.jsxs)("body",{className:"bg-white text-black",children:[(0,b.jsx)(d.default,{}),(0,b.jsx)("main",{className:"w-full min-h-screen",children:a}),(0,b.jsx)(h,{}),(0,b.jsx)(g,{}),(0,b.jsx)(i,{}),(0,b.jsx)(c.default,{id:"client-logger",strategy:"afterInteractive",children:`
            (function () {
              function send(payload){
                try {
                  navigator.sendBeacon && navigator.sendBeacon('/api/client-log', JSON.stringify(payload))
                  || fetch('/api/client-log', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify(payload),
                      keepalive: true
                    });
                } catch(_) {}
              }

              window.addEventListener('error', function(ev){
                try {
                  const e = ev.error || {};
                  send({
                    type: 'error',
                    message: e && e.message || String(ev.message || 'Unknown error'),
                    stack: e && e.stack || null,
                    source: ev.filename || null,
                    lineno: ev.lineno || null,
                    colno: ev.colno || null,
                    href: location.href,
                    ua: navigator.userAgent
                  });
                } catch(_) {}
              });

              window.addEventListener('unhandledrejection', function(ev){
                try {
                  const r = ev.reason || {};
                  send({
                    type: 'unhandledrejection',
                    message: (r && r.message) || (typeof r==='string'? r : JSON.stringify(r)),
                    stack: r && r.stack || null,
                    href: location.href,
                    ua: navigator.userAgent
                  });
                } catch(_) {}
              });
            })();
          `})]})})}a.s(["default",()=>o,"metadata",0,n],90326)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__991c9954._.js.map