import sys, gi
gi.require_version('Gtk', '3.0'); gi.require_version('Gdk', '3.0')
from gi.repository import Gtk, Gdk
from gi.repository import GLib
uri = GLib.filename_to_uri(sys.argv[1], None)
w = Gtk.Window(); w.set_decorated(False); w.set_default_size(160, 60); w.move(int(sys.argv[2]), int(sys.argv[3]))
b = Gtk.Button(label='DRAG ' + sys.argv[1].split('/')[-1]); w.add(b)
b.drag_source_set(Gdk.ModifierType.BUTTON1_MASK, [], Gdk.DragAction.COPY)
b.drag_source_add_uri_targets()
def get(widget, ctx, data, info, t): data.set_uris([uri])
b.connect('drag-data-get', get)
b.connect('drag-end', lambda *a: Gtk.main_quit())
w.connect('destroy', Gtk.main_quit); w.show_all(); Gtk.main()
