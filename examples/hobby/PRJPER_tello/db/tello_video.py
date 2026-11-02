# =====================================================================
# tello_video.py -- PRJPER_tello: the drone's camera, decoded in Python.
#
# FOR LINUX AND THE RASPBERRY PI. On Windows the engine decodes the
# Tello's H.264 itself (CN_VID, con_host="udp:..."); on Linux it has no
# H.264 decoder yet, so this script does it with OpenCV and hands every
# picture to the engine. db_TEL.xml says how to switch (two attributes).
#
#   UDP 11111 --H.264--> OpenCV (FFmpeg) --RGB picture--> id('VID')/@frm
#                                                          |
#   CN_VID  con_host="link:VID?atr=frm" <------------------+
#           (JPEG, 10 a second, the page's MJPEG as on Windows)
#
# VID's sta says whether pictures are coming: 0x0303 while the stream runs,
# 0x0302 while it does not. CN_VID's link: is idle while its source is not
# running, so a drone that has not been told "streamon" is no lost camera.
#
# A worker thread reads the stream: cv2.VideoCapture blocks while it
# waits for data, and the engine's Python thread must not. The UDP
# timeout (1 s) lets the worker see the stop flag; done() sets it and
# the engine waits for the worker before it closes Python (thr_tmo).
#
# Needs: Python 3.11 or 3.13 with numpy and OpenCV --
#   sudo apt install python3-opencv            (Raspberry Pi OS, Debian)
#   python3 -m pip install opencv-python-headless   (anywhere else)
# =====================================================================
from XDB import *
import threading

xdb = None
xdb_evt = []

# FFmpeg's udp:// options: timeout in microseconds (a read gives up after 1 s
# without data), a large receive buffer (a key frame is one burst), and keep
# going when the buffer overruns instead of failing
URL = "udp://@0.0.0.0:11111?timeout=1000000&fifo_size=1000000&overrun_nonfatal=1&buffer_size=4194304"

g_stop = threading.Event()
g_th = None


def init(xdb_in):
    global xdb, xdb_evt
    xdb = xdb_in
    xdb_evt = [
        # 0:id   1:atr   2:init     3:loop     4:done     5:arg
        ["VID", "val",  vid_init,  vid_loop,  vid_done,  None],
    ]


def reader(stop, e):
    try:
        import cv2
    except ImportError as x:
        e.Log(3, "VID: OpenCV is not installed for this Python (" + str(x) + ") - no camera picture")
        return
    e.Log(4, "VID: OpenCV " + cv2.__version__ + " listening for the camera on UDP 11111")
    e.SetValue("id('VID')/@sta", 0x0302)
    cap = None
    pics = 0
    while not stop.is_set():
        if cap is None:
            cap = cv2.VideoCapture(URL, cv2.CAP_FFMPEG)
            if not cap.isOpened():                  # nothing arrived within the timeout
                cap = None
                stop.wait(0.5)
                continue
            e.Log(4, "VID: the camera stream started")
            e.SetValue("id('VID')/@sta", 0x0303)
        ok, frame = cap.read()
        if not ok:                                  # the stream stopped (streamoff, the drone gone)
            cap.release()
            cap = None
            e.Log(4, "VID: the camera stream stopped after %d picture(s)" % pics)
            e.SetValue("id('VID')/@sta", 0x0302)
            continue
        pics += 1
        # OpenCV gives BGR; the engine's link: takes RGB (u8, height x width x 3)
        e.SetValue("id('VID')/@frm", cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    if cap is not None:
        cap.release()


def vid_init(evt, arg):
    global g_th
    g_stop.clear()
    g_th = threading.Thread(target=reader, args=(g_stop, xdb.evt), name="tello-video")
    g_th.start()


def vid_loop(evt, arg):
    pass


def vid_done(evt, arg):
    g_stop.set()
    if g_th is not None:
        g_th.join(5)
