# Zones

Put touch areas inside each other and each still gets the touches it should.

A photo carousel inside a screen you can swipe back from, a drawing pad inside a page with a swipe-out sidebar: both want the same finger. Zones nest, and you decide who wins without either knowing about the other.

The innermost zone that wants a direction gets it, so [an inner zone takes the swipe it wants and the outer zone gets the rest](web-platform/gestures/zones/the-inner-zone-takes-its-own-direction). When an area should keep every touch for itself, mark it `trapped`, and [a drawing pad keeps strokes from the screen edge](web-platform/gestures/zones/a-trapped-zone-keeps-its-touches) instead of opening the sidebar.
