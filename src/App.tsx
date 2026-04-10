import { useState, useEffect, useMemo } from "react";
import { format, addHours, startOfDay, isSameDay, parseISO, setHours, setMinutes, addDays, subDays, addWeeks, addMonths, subMonths, isBefore, isAfter, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { de } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock, Users, CheckCircle2, AlertCircle, Trash2, Plus, Info, Repeat, ChevronLeft, ChevronRight, LayoutGrid, CalendarDays } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { TABLES, Booking, OPENING_HOUR, CLOSING_HOUR } from "./types";

export default function App() {
  const [date, setDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<"day" | "month">("day");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    bookingId: string;
    memberName: string;
    date: string;
    tableId: number;
    startTime: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [newBooking, setNewBooking] = useState<{
    tableId: string;
    memberName: string;
    startTime: string;
    duration: string;
    recurrence: "none" | "daily" | "weekly" | "monthly";
    recurrenceUntil: Date;
  }>({
    tableId: "1",
    memberName: "",
    startTime: "10:00",
    duration: "1",
    recurrence: "none",
    recurrenceUntil: addMonths(new Date(), 1),
  });

  // Load bookings from server
  useEffect(() => {
    fetchBookings();
    
    // Global error handler to help diagnose issues on the user's server
    const handleError = (event: ErrorEvent) => {
      alert("Ein Anwendungsfehler ist aufgetreten: " + event.message);
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  const fetchBookings = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("api.php");
      if (response.ok) {
        const data = await response.json();
        setBookings(data);
      }
    } catch (e) {
      console.error("Failed to fetch bookings", e);
    } finally {
      setIsLoading(false);
    }
  };

  const saveBookings = async (updatedBookings: Booking[]) => {
    try {
      const response = await fetch("api.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedBookings),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Serverfehler beim Speichern");
      }
      return true;
    } catch (e) {
      console.error("Failed to save bookings", e);
      alert("Fehler beim Speichern: " + (e instanceof Error ? e.message : "Unbekannter Fehler"));
      return false;
    }
  };

  const filteredBookings = useMemo(() => {
    const dateStr = format(date, "yyyy-MM-dd");
    return bookings.filter((b) => b.date === dateStr);
  }, [bookings, date]);

  const handleAddBooking = async () => {
    if (!newBooking.memberName) return;

    const [hours, minutes] = newBooking.startTime.split(":").map(Number);
    
    // Fallback for crypto.randomUUID which requires HTTPS
    const generateId = () => {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
      }
      return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    };

    const bookingsToAdd: Booking[] = [];
    let currentStartDate = startOfDay(date);
    const untilDate = startOfDay(newBooking.recurrenceUntil);

    while (true) {
      const start = setMinutes(setHours(currentStartDate, hours), minutes);
      const end = addHours(start, Number(newBooking.duration));
      const dateStr = format(currentStartDate, "yyyy-MM-dd");

      const booking: Booking = {
        id: generateId(),
        tableId: Number(newBooking.tableId),
        memberName: newBooking.memberName,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        date: dateStr,
      };

      // Check for collisions for this specific instance
      const hasCollision = bookings.some((b) => {
        if (b.tableId !== booking.tableId) return false;
        if (b.date !== dateStr) return false;
        const bStart = parseISO(b.startTime);
        const bEnd = parseISO(b.endTime);
        return (start < bEnd && end > bStart);
      });

      if (hasCollision) {
        alert(`Kollision am ${format(currentStartDate, "dd.MM.yyyy")}: Dieser Tisch ist bereits belegt!`);
        return;
      }

      bookingsToAdd.push(booking);

      if (newBooking.recurrence === "none") break;
      
      if (newBooking.recurrence === "daily") currentStartDate = addDays(currentStartDate, 1);
      else if (newBooking.recurrence === "weekly") currentStartDate = addWeeks(currentStartDate, 1);
      else if (newBooking.recurrence === "monthly") currentStartDate = addMonths(currentStartDate, 1);

      if (isAfter(currentStartDate, untilDate)) break;
      
      // Safety limit: max 50 bookings at once
      if (bookingsToAdd.length >= 50) {
        alert("Maximale Anzahl von 50 Serienbuchungen erreicht.");
        break;
      }
    }

    const updated = [...bookings, ...bookingsToAdd];
    const success = await saveBookings(updated);
    
    if (success) {
      setBookings(updated);
      setIsBookingOpen(false);
      setNewBooking({ ...newBooking, memberName: "" });
    }
  };

  const deleteBooking = async (id: string, deleteAllFollowing: boolean = false) => {
    let updated: Booking[];
    
    if (deleteAllFollowing && deleteConfirmation) {
      const targetBooking = bookings.find(b => b.id === id);
      if (!targetBooking) return;
      
      const targetDate = parseISO(targetBooking.startTime);
      
      updated = bookings.filter((b) => {
        // Keep bookings that:
        // 1. Are NOT for the same member/table (unrelated)
        // 2. OR are BEFORE the target date
        const bDate = parseISO(b.startTime);
        const isSameSeries = b.memberName === targetBooking.memberName && b.tableId === targetBooking.tableId;
        return !(isSameSeries && (isSameDay(bDate, targetDate) || isAfter(bDate, targetDate)));
      });
    } else {
      updated = bookings.filter((b) => b.id !== id);
    }

    setBookings(updated);
    await saveBookings(updated);
    setDeleteConfirmation(null);
  };

  const timeSlots = Array.from({ length: CLOSING_HOUR - OPENING_HOUR + 1 }, (_, i) => {
    const hour = OPENING_HOUR + i;
    return `${hour.toString().padStart(2, "0")}:00`;
  });

  return (
    <div className="min-h-screen bg-[#f0f4f0] text-slate-900 font-sans">
      {/* Top Branding Bar */}
      <div className="bg-[#004d00] text-white py-2 px-4 text-center text-xs font-medium tracking-widest uppercase">
        1. Pool Billard Club Ingelheim e.V.
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
        {/* Header Section */}
        <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="bg-[#004d00] p-2.5 rounded-xl shadow-inner">
                <Users className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900">
                Tischreservierung
              </h1>
            </div>
            <p className="text-slate-500 max-w-md">
              Buchen Sie Ihren Tisch im Vereinsheim Budenheim. Wir verfügen über 4 Dynamics II Tische.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <Button
                variant={viewMode === "day" ? "secondary" : "ghost"}
                size="sm"
                className={cn("h-9 px-4 rounded-lg font-bold text-xs gap-2", viewMode === "day" && "bg-white shadow-sm")}
                onClick={() => setViewMode("day")}
              >
                <LayoutGrid className="h-4 w-4" />
                Tag
              </Button>
              <Button
                variant={viewMode === "month" ? "secondary" : "ghost"}
                size="sm"
                className={cn("h-9 px-4 rounded-lg font-bold text-xs gap-2", viewMode === "month" && "bg-white shadow-sm")}
                onClick={() => setViewMode("month")}
              >
                <CalendarDays className="h-4 w-4" />
                Monat
              </Button>
            </div>

            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    className="w-full sm:w-[240px] justify-start text-left font-semibold border-slate-200 bg-slate-50 hover:bg-slate-100 transition-all"
                  />
                }
              >
                <CalendarIcon className="mr-2 h-4 w-4 text-[#004d00]" />
                {date ? format(date, "PPP", { locale: de }) : <span>Datum wählen</span>}
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <div className="p-3 border-b border-slate-100 flex justify-between items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-xs font-bold text-[#004d00]"
                    onClick={() => setDate(new Date())}
                  >
                    Heute
                  </Button>
                  <div className="flex gap-1">
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-7 w-7"
                      onClick={() => setDate(subMonths(date, 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-7 w-7"
                      onClick={() => setDate(addMonths(date, 1))}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => d && setDate(d)}
                  initialFocus
                  locale={de}
                  className="rounded-md"
                />
              </PopoverContent>
            </Popover>

            <Dialog open={isBookingOpen} onOpenChange={setIsBookingOpen}>
              <DialogTrigger
                render={
                  <Button className="bg-[#004d00] hover:bg-[#003300] text-white font-bold shadow-lg shadow-green-900/20 gap-2 h-11 px-6" />
                }
              >
                <Plus className="h-5 w-5" />
                Jetzt Buchen
              </DialogTrigger>
              <DialogContent className="sm:max-w-[450px] rounded-3xl">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold text-[#004d00]">Tisch Reservieren</DialogTitle>
                  <DialogDescription>
                    Reservierung für {format(date, "EEEE, dd. MMMM", { locale: de })}.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-6 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-bold uppercase tracking-wider text-slate-500">Mitgliedsname</Label>
                    <Input
                      id="name"
                      placeholder="Vorname Nachname"
                      className="h-12 border-slate-200 focus:ring-[#004d00] focus:border-[#004d00]"
                      value={newBooking.memberName}
                      onChange={(e) => setNewBooking({ ...newBooking, memberName: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold uppercase tracking-wider text-slate-500">Tisch</Label>
                      <Select
                        value={newBooking.tableId}
                        onValueChange={(v) => setNewBooking({ ...newBooking, tableId: v })}
                      >
                        <SelectTrigger className="h-12">
                          <SelectValue placeholder="Tisch" />
                        </SelectTrigger>
                        <SelectContent>
                          {TABLES.map((t) => (
                            <SelectItem key={t.id} value={t.id.toString()}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold uppercase tracking-wider text-slate-500">Startzeit</Label>
                      <Select
                        value={newBooking.startTime}
                        onValueChange={(v) => setNewBooking({ ...newBooking, startTime: v })}
                      >
                        <SelectTrigger className="h-12">
                          <SelectValue placeholder="Zeit" />
                        </SelectTrigger>
                        <SelectContent>
                          {timeSlots.map((slot) => (
                            <SelectItem key={slot} value={slot}>
                              {slot}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold uppercase tracking-wider text-slate-500">Dauer</Label>
                    <Select
                      value={newBooking.duration}
                      onValueChange={(v) => setNewBooking({ ...newBooking, duration: v })}
                    >
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="Dauer" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 Stunde</SelectItem>
                        <SelectItem value="2">2 Stunden</SelectItem>
                        <SelectItem value="3">3 Stunden</SelectItem>
                        <SelectItem value="4">4 Stunden</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="border-t border-slate-100 pt-4 mt-2 space-y-4">
                    <div className="flex items-center gap-2 text-[#004d00] font-bold text-sm">
                      <Repeat className="h-4 w-4" />
                      Wiederholung
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">Intervall</Label>
                        <Select
                          value={newBooking.recurrence}
                          onValueChange={(v: any) => setNewBooking({ ...newBooking, recurrence: v })}
                        >
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Keine" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Keine</SelectItem>
                            <SelectItem value="daily">Täglich</SelectItem>
                            <SelectItem value="weekly">Wöchentlich</SelectItem>
                            <SelectItem value="monthly">Monatlich</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {newBooking.recurrence !== "none" && (
                        <div className="space-y-2">
                          <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">Bis Datum</Label>
                          <Popover>
                            <PopoverTrigger
                              render={
                                <Button
                                  variant="outline"
                                  className="w-full h-10 justify-start text-left font-medium border-slate-200 text-xs"
                                />
                              }
                            >
                              <CalendarIcon className="mr-2 h-3 w-3" />
                              {format(newBooking.recurrenceUntil, "dd.MM.yy")}
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                              <Calendar
                                mode="single"
                                selected={newBooking.recurrenceUntil}
                                onSelect={(d) => d && setNewBooking({ ...newBooking, recurrenceUntil: d })}
                                initialFocus
                                locale={de}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" onClick={handleAddBooking} className="w-full h-12 bg-[#004d00] hover:bg-[#003300] text-lg font-bold">
                    Reservierung Bestätigen
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </header>

        {/* Day Navigation Bar */}
        <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-slate-400 hover:text-[#004d00] hover:bg-green-50"
            onClick={() => setDate(viewMode === "day" ? subDays(date, 1) : subMonths(date, 1))}
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          
          <div className="flex flex-col items-center">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
              {viewMode === "day" ? format(date, "EEEE", { locale: de }) : "Monatsübersicht"}
            </span>
            <span className="text-lg font-black text-slate-900">
              {viewMode === "day" ? format(date, "dd. MMMM yyyy", { locale: de }) : format(date, "MMMM yyyy", { locale: de })}
            </span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-slate-400 hover:text-[#004d00] hover:bg-green-50"
            onClick={() => setDate(viewMode === "day" ? addDays(date, 1) : addMonths(date, 1))}
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
        </div>

        {viewMode === "day" ? (
          /* Tables Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {TABLES.map((table) => {
              const tableBookings = filteredBookings
                .filter((b) => b.tableId === table.id)
                .sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime());

              return (
                <Card key={table.id} className="border-none shadow-md overflow-hidden flex flex-col bg-white hover:shadow-xl transition-shadow duration-300">
                  <div className="h-2 bg-[#004d00]" />
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xl font-black text-slate-800">{table.name}</CardTitle>
                    </div>
                    <CardDescription className="font-medium">
                      {tableBookings.length === 0 ? "Keine Reservierungen" : `${tableBookings.length} Buchung(en)`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-grow p-4 pt-0 space-y-3">
                    {isLoading ? (
                      <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#004d00]"></div>
                      </div>
                    ) : tableBookings.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-slate-300 space-y-3 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                        <CheckCircle2 className="h-10 w-10 opacity-20" />
                        <p className="text-xs font-bold uppercase tracking-wider">Tisch verfügbar</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {tableBookings.map((b) => (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            key={b.id}
                            className="group relative bg-white border border-slate-100 rounded-xl p-3.5 shadow-sm hover:border-[#004d00]/30 transition-all"
                          >
                            <div className="flex justify-between items-center">
                              <div className="space-y-1">
                                <p className="text-sm font-bold text-slate-800">{b.memberName}</p>
                                <div className="flex items-center text-[11px] font-bold text-slate-500 gap-1.5">
                                  <Clock className="h-3.5 w-3.5 text-[#004d00]" />
                                  <span className="bg-slate-100 px-1.5 py-0.5 rounded">
                                    {format(parseISO(b.startTime), "HH:mm")} - {format(parseISO(b.endTime), "HH:mm")}
                                  </span>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-all"
                                onClick={() => setDeleteConfirmation({
                                  isOpen: true,
                                  bookingId: b.id,
                                  memberName: b.memberName,
                                  date: b.date,
                                  tableId: b.tableId,
                                  startTime: b.startTime
                                })}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="p-4 bg-slate-50/80 border-t border-slate-100">
                    <Button
                      variant="outline"
                      className="w-full text-xs font-bold uppercase tracking-widest text-slate-600 hover:bg-white hover:text-[#004d00] hover:border-[#004d00] transition-all"
                      onClick={() => {
                        setNewBooking({ ...newBooking, tableId: table.id.toString() });
                        setIsBookingOpen(true);
                      }}
                    >
                      Reservieren
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        ) : (
          /* Monthly View */
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
              {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((day) => (
                <div key={day} className="py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {(() => {
                const start = startOfMonth(date);
                const end = endOfMonth(date);
                const days = eachDayOfInterval({ start, end });
                
                // Add padding for the first week
                const firstDayIdx = (start.getDay() + 6) % 7; // Adjust for Mo-So
                const padding = Array.from({ length: firstDayIdx });

                return [
                  ...padding.map((_, i) => <div key={`pad-${i}`} className="h-24 md:h-32 border-r border-b border-slate-50 bg-slate-50/30" />),
                  ...days.map((day) => {
                    const dayStr = format(day, "yyyy-MM-dd");
                    const dayBookings = bookings.filter(b => b.date === dayStr);
                    const isToday = isSameDay(day, new Date());
                    
                    return (
                      <div 
                        key={dayStr} 
                        className={cn(
                          "h-24 md:h-32 border-r border-b border-slate-100 p-2 transition-colors hover:bg-slate-50 cursor-pointer",
                          isToday && "bg-green-50/30"
                        )}
                        onClick={() => {
                          setDate(day);
                          setViewMode("day");
                        }}
                      >
                        <div className="flex justify-between items-start">
                          <span className={cn(
                            "text-xs font-bold h-6 w-6 flex items-center justify-center rounded-full",
                            isToday ? "bg-[#004d00] text-white" : "text-slate-400"
                          )}>
                            {format(day, "d")}
                          </span>
                        </div>
                        <div className="mt-2 space-y-1 overflow-hidden">
                          {TABLES.map(table => {
                            const count = dayBookings.filter(b => b.tableId === table.id).length;
                            if (count === 0) return null;
                            return (
                              <div key={table.id} className="flex items-center gap-1 text-[9px] font-bold text-slate-600 truncate">
                                <div className="h-1.5 w-1.5 rounded-full bg-[#004d00]" />
                                T{table.id}: {count}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                ];
              })()}
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteConfirmation?.isOpen || false} onOpenChange={(open) => !open && setDeleteConfirmation(null)}>
          <DialogContent className="sm:max-w-[400px] rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-slate-900">Reservierung löschen</DialogTitle>
              <DialogDescription className="pt-2">
                Möchten Sie die Reservierung von <span className="font-bold text-slate-900">{deleteConfirmation?.memberName}</span> am {deleteConfirmation && format(parseISO(deleteConfirmation.startTime), "dd.MM.yyyy 'um' HH:mm", { locale: de })} Uhr wirklich löschen?
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-4">
              <Button 
                variant="outline" 
                className="h-12 justify-start px-4 border-slate-200 hover:bg-slate-50 text-slate-700 font-medium"
                onClick={() => deleteConfirmation && deleteBooking(deleteConfirmation.bookingId, false)}
              >
                Nur diesen Termin löschen
              </Button>
              <Button 
                variant="outline" 
                className="h-12 justify-start px-4 border-slate-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200 font-medium"
                onClick={() => deleteConfirmation && deleteBooking(deleteConfirmation.bookingId, true)}
              >
                Diesen und alle folgenden Serientermine löschen
              </Button>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDeleteConfirmation(null)} className="w-full h-11 text-slate-500 font-bold">
                Abbrechen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Footer Info */}
        <footer className="bg-[#004d00] text-white rounded-3xl p-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">
            <Users className="h-64 w-64" />
          </div>
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="space-y-4 text-center md:text-left">
              <div className="inline-flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest">
                <Info className="h-3 w-3" />
                System-Info
              </div>
              <h3 className="text-2xl font-black">Zentrale Datenspeicherung</h3>
              <p className="text-green-100/80 max-w-xl text-sm leading-relaxed font-medium">
                Ihre Buchungen werden sicher auf dem Webspace in einer zentralen Datei gespeichert. 
                Alle Vereinsmitglieder sehen denselben Stand in Echtzeit. 
                Keine externe Datenbank erforderlich.
              </p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="text-4xl font-black">4</div>
              <div className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60 text-center">
                Dynamics II<br/>Profi-Tische
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
