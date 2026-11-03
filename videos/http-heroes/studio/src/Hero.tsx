export const Hero = ({gesture = 0}: {gesture?: number}) => (
  <svg viewBox="0 0 600 700" width="100%" height="100%" aria-label="Spider-Man comic illustration">
    <defs>
      <pattern id="suitdots" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.3" fill="#0b1635" opacity=".22"/></pattern>
      <linearGradient id="red" x2="1" y2="1"><stop stopColor="#ff4351"/><stop offset="1" stopColor="#bd1235"/></linearGradient>
    </defs>
    <g stroke="#111527" strokeWidth="10" strokeLinejoin="round" strokeLinecap="round">
      <path d="M202 395 Q112 402 85 545 L125 600 206 507 203 671 410 671 398 463 453 390 410 344 355 407Z" fill="#184ab7"/>
      <path d="M204 393 Q250 363 300 376 Q361 370 401 414 L370 545 230 545Z" fill="url(#red)"/>
      <path d="M206 418 L159 478 127 555 77 535 Q91 440 163 397Z" fill="url(#red)"/>
      <g transform={`rotate(${gesture} 409 410)`}>
        <path d="M368 414 Q420 462 466 399 L510 320 471 293 409 367 395 351Z" fill="url(#red)"/>
        <path d="M468 310 L459 267 Q457 249 468 247 Q479 245 483 270 L491 288 490 207 Q489 186 501 187 Q513 189 513 208 L518 272 534 228 Q543 210 553 216 Q565 224 553 243 L541 286 553 272 Q571 265 576 278 Q579 289 558 303 L530 337 502 344Z" fill="url(#red)" strokeWidth="7"/>
        <path d="M486 291 L523 310 M493 278 L535 290" fill="none" strokeWidth="3"/>
      </g>
      <path d="M251 352 L249 396 Q301 426 345 391 L345 347" fill="url(#red)"/>
      <path d="M202 220 Q198 134 275 116 Q350 99 382 170 Q407 229 371 299 Q342 361 287 369 Q223 353 202 281Z" fill="url(#red)"/>
      <path d="M202 220 Q198 134 275 116 Q350 99 382 170 Q407 229 371 299 Q342 361 287 369 Q223 353 202 281Z" fill="url(#suitdots)" stroke="none"/>
      <g fill="none" stroke="#351b3a" strokeWidth="3" opacity=".8">
        <path d="M292 122 L290 359 M211 169 L368 295 M212 285 L357 144 M202 228 L390 228 M240 129 Q251 226 227 319 M339 128 Q329 225 355 319"/>
        <path d="M212 170 Q290 201 374 167 M204 204 Q289 239 388 204 M211 272 Q291 246 382 273 M227 310 Q290 286 366 309 M250 342 Q295 325 343 342"/>
        <path d="M300 409 L300 538 M244 400 L358 532 M361 400 L240 532 M238 440 Q300 461 384 438 M232 489 Q301 468 375 490"/>
      </g>
      <path d="M216 211 Q243 211 280 247 Q268 280 244 275 Q220 264 216 211Z" fill="#fffce9"/>
      <path d="M302 247 Q343 208 379 204 Q378 253 346 272 Q321 285 302 247Z" fill="#fffce9"/>
      <g strokeWidth="6" fill="#121627">
        <ellipse cx="302" cy="465" rx="10" ry="19"/><circle cx="302" cy="444" r="7"/>
        <path d="M295 453 L276 434 272 416 M294 464 L269 457 257 441 M295 475 L270 485 260 509 M309 453 L328 434 332 416 M310 464 L335 457 347 441 M309 475 L334 485 344 509" fill="none"/>
      </g>
      <path d="M201 672 L231 548 292 566 283 700 M405 672 L370 548 311 566 321 700" fill="#184ab7"/>
    </g>
  </svg>
);
