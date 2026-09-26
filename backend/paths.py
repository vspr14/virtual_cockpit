"""Filesystem locations, valid both from source and from a PyInstaller bundle."""
import os
import sys

if getattr(sys, 'frozen', False):
    BASE_DIR = sys._MEIPASS
else:
    BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

TEMPLATES_DIR = os.path.join(BASE_DIR, 'templates')
STATIC_DIR = os.path.join(BASE_DIR, 'static')
AIRCRAFT_DIR = os.path.join(BASE_DIR, 'aircraft')
